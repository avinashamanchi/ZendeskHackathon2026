"use client";

import * as React from "react";
import { useEffect } from "react";

export function AxeDev() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    let active = true;
    void Promise.all([import("@axe-core/react"), import("react-dom")])
      .then(([axeModule, ReactDOM]) => {
        if (active) axeModule.default(React, ReactDOM, 1_000);
      })
      .catch((error) => {
        console.info("[Wordless] Development accessibility audit unavailable", error);
      });
    return () => {
      active = false;
    };
  }, []);

  return null;
}
