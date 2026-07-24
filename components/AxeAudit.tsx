"use client";

import { useEffect } from "react";

// Dev-only: the app audits itself. @axe-core/react logs any violation to the
// console; the bar is zero. Production builds ship none of this.

export default function AxeAudit() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    Promise.all([import("@axe-core/react"), import("react"), import("react-dom")])
      .then(([axe, React, ReactDOM]) => axe.default(React.default, ReactDOM.default, 1000))
      .catch((err) => console.warn("[point] axe audit unavailable:", err));
  }, []);
  return null;
}
