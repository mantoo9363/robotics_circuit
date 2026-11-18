"use client";

import { useState } from "react";
import BlocklyEditor from "../blockly/BlocklyEditor";
import { useBlocklyStore } from "@cs/store/useBlocklyStore";
import { useEditorPanelStore } from "@cs/store/useEditorPanelStore";

export function EditorPanel() {
  const [activeTab, setActiveTab] = useState<"blockly" | "code">("blockly");

  const { code } = useBlocklyStore();

  const { open, close } = useEditorPanelStore();

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 bg-[#0b1220] border-l border-white/10 flex flex-col">

      {/* HEADER */}
      <div className="h-12 border-b border-white/10 flex items-center px-4 gap-3 bg-slate-900">

        <button
          onClick={() => setActiveTab("blockly")}
          className={`px-4 py-1.5 rounded text-sm transition-colors ${
            activeTab === "blockly"
              ? "bg-cyan-500 text-white"
              : "bg-slate-800 text-slate-300"
          }`}
        >
          Blockly
        </button>

        <button
          onClick={() => setActiveTab("code")}
          className={`px-4 py-1.5 rounded text-sm transition-colors ${
            activeTab === "code"
              ? "bg-emerald-500 text-white"
              : "bg-slate-800 text-slate-300"
          }`}
        >
          Code
        </button>

        <div className="ml-auto">
          <button
            onClick={close}
            className="px-3 py-1 rounded bg-red-500 hover:bg-red-400 text-white text-sm"
          >
            Close
          </button>
        </div>

      </div>

      {/* BODY */}
      <div className="flex-1 overflow-hidden">

        {activeTab === "blockly" && (
          <div className="h-full">
            <BlocklyEditor />
          </div>
        )}

        {activeTab === "code" && (
          <div className="h-full bg-black text-green-400 overflow-auto p-4 font-mono text-sm">
            <pre>
              <code>
                {code || "// Blockly generated Arduino code"}
              </code>
            </pre>
          </div>
        )}

      </div>
    </div>
  );
}