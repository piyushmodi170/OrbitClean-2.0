"use client";

import { useState, useEffect, useRef } from "react";
import type { FieldReport } from "@/types";
import { apiUrl } from "@/lib/api";

const POLL_INTERVAL_MS = 4000;

export function useFieldReports() {
  const [reports, setReports] = useState<FieldReport[]>([]);
  const [newCount, setNewCount] = useState(0);
  const prevLengthRef = useRef(0);
  const lastSignature = useRef("");

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(apiUrl("/api/field-reports?limit=50"), {
          signal: AbortSignal.timeout(4000),
          cache: "no-store",
        });
        if (!res.ok || !active) return;
        const data = await res.json();
        const incoming: FieldReport[] = data.reports ?? [];
        const signature = incoming.map((report) => report.id).join("|");
        const previous = prevLengthRef.current;
        if (signature !== lastSignature.current) {
          setNewCount(Math.max(0, incoming.length - previous));
          prevLengthRef.current = incoming.length;
          lastSignature.current = signature;
          setReports(incoming);
        }
      } catch {
        // API offline — silently skip
      }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

  return { reports, newCount };
}
