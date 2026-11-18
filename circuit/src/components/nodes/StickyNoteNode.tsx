import { type NodeProps, useReactFlow } from "@xyflow/react";
import { useState, useEffect } from "react";
import { useCircuitStore } from "@cs/lib/store";

export function StickyNoteNode(props: NodeProps) {
  const { id, data } = props;
  const [text, setText] = useState(String(data.text || ""));
  const minimized = !!data.minimized;
  const { getViewport } = useReactFlow();

  // Sync text state with store if changed elsewhere
  useEffect(() => {
    setText(String(data.text || ""));
  }, [data.text]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextText = e.target.value;
    setText(nextText);

    // Update the node's data in the Zustand store
    const store = useCircuitStore.getState();
    store.updateNodeData(id, { text: nextText });
  };

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    const store = useCircuitStore.getState();
    store.pushHistory();

    const nodeElement = e.currentTarget.closest(".react-flow__node");
    let deltaX = 78; // Fallback: (220 - 64) / 2
    let deltaY = 16; // Fallback: 64 - 48

    if (nodeElement) {
      const bubbleElement = nodeElement.querySelector(".rounded-2xl");
      if (bubbleElement) {
        const rect = bubbleElement.getBoundingClientRect();
        const { zoom } = getViewport();
        const width = rect.width / zoom;
        const height = rect.height / zoom;
        deltaX = (width - 64) / 2;
        deltaY = height - 48;
      }
    }

    const currentNode = store.nodes.find((n) => n.id === id);
    if (currentNode) {
      const nextPosition = {
        x: currentNode.position.x + deltaX,
        y: currentNode.position.y + deltaY,
      };
      useCircuitStore.setState({
        nodes: store.nodes.map((n) =>
          n.id === id
            ? {
                ...n,
                position: nextPosition,
                data: { ...n.data, minimized: true },
              }
            : n,
        ),
      });
    }
  };

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    const store = useCircuitStore.getState();
    store.pushHistory();

    const lineCount = text.split("\n").length;
    const estimatedHeight = Math.max(64, 40 + lineCount * 20);
    const deltaX = 78; // (220 - 64) / 2
    const deltaY = estimatedHeight - 48;

    const currentNode = store.nodes.find((n) => n.id === id);
    if (currentNode) {
      const nextPosition = {
        x: currentNode.position.x - deltaX,
        y: currentNode.position.y - deltaY,
      };
      useCircuitStore.setState({
        nodes: store.nodes.map((n) =>
          n.id === id
            ? {
                ...n,
                position: nextPosition,
                data: { ...n.data, minimized: false },
              }
            : n,
        ),
      });
    }
  };

  if (minimized) {
    return (
      <div
        onClick={handleExpand}
        className="relative flex flex-col items-center select-none pb-12 cursor-pointer transition-all hover:scale-105 active:scale-95 animate-in fade-in duration-200"
        title="Click to expand note"
      >
        {/* Minimized Speech Bubble (Matches Image 1) */}
        <div className="relative w-16 h-12 rounded-xl border-2 border-[#1d70b8] bg-[#f4f8fe] shadow-md flex items-center justify-center">
          {/* SVG representation of text lines */}
          <svg
            width="24"
            height="18"
            viewBox="0 0 24 18"
            fill="none"
            className="overflow-visible pointer-events-none"
          >
            <line
              x1="2"
              y1="3"
              x2="22"
              y2="3"
              stroke="#475569"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1="2"
              y1="7.5"
              x2="16"
              y2="7.5"
              stroke="#475569"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1="2"
              y1="12"
              x2="22"
              y2="12"
              stroke="#475569"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1="2"
              y1="16.5"
              x2="12"
              y2="16.5"
              stroke="#475569"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>

          {/* Speech Bubble Pointer (Triangle) */}
          <svg
            width="14"
            height="9"
            viewBox="0 0 14 9"
            fill="none"
            className="absolute -bottom-[8px] left-1/2 -translate-x-1/2 pointer-events-none"
          >
            <polygon points="1,1 7,7 13,1" fill="#f4f8fe" />
            <path
              d="M 1 1 L 7 7 L 13 1"
              stroke="#1d70b8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line
              x1="2"
              y1="1"
              x2="12"
              y2="1"
              stroke="#f4f8fe"
              strokeWidth="2"
            />
          </svg>
        </div>

        {/* Anchor point at the bottom */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center justify-center">
          {/* Halo highlight */}
          <div className="absolute w-7 h-7 rounded-full bg-[#1d70b8]/15 border border-[#1d70b8]/30" />
          {/* Inner circle */}
          <div className="relative z-10 w-4 h-4 rounded-full bg-white border border-slate-800" />
        </div>
      </div>
    );
  }

  // Expanded State (Matches Image 2)
  return (
    <div className="relative flex flex-col items-center select-none pb-12 animate-in fade-in duration-200">
      {/* Speech Bubble Box */}
      <div className="relative w-[220px] min-h-[64px] rounded-2xl border-2 border-[#1d70b8] bg-white px-4 py-3 shadow-lg flex items-center justify-center">
        {/* Textarea for note text */}
        <textarea
          value={text}
          onChange={handleChange}
          className="nodrag nopan w-full bg-transparent border-none outline-none resize-none text-slate-800 text-sm font-medium placeholder-slate-400/70 leading-normal font-sans cursor-text text-center"
          placeholder="Write your note here."
          rows={2}
        />

        {/* Speech Bubble Pointer (Triangle) */}
        <svg
          width="24"
          height="14"
          viewBox="0 0 24 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute -bottom-[13px] left-1/2 -translate-x-1/2 pointer-events-none"
        >
          {/* A polygon that extends slightly above y=2 to cover the container's border */}
          <polygon points="2,2 12,12 22,2" fill="white" />
          {/* The side borders */}
          <path
            d="M 2 2 L 12 12 L 22 2"
            stroke="#1d70b8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* A white line at the top to mask the border of the container */}
          <line x1="3" y1="2" x2="21" y2="2" stroke="white" strokeWidth="2" />
        </svg>
      </div>

      {/* Anchor point at the bottom */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center justify-center">
        {/* Halo highlight */}
        <div className="absolute w-8 h-8 rounded-full bg-[#1d70b8]/15 border border-[#1d70b8]/30 animate-pulse" />
        {/* Inner circle with minus sign (Minimize button) */}
        <button
          onClick={handleMinimize}
          className="relative z-10 w-5 h-5 rounded-full bg-white border border-slate-800 flex items-center justify-center hover:bg-slate-100 transition-colors shadow-sm cursor-pointer group animate-in zoom-in duration-200"
          title="Minimize note"
        >
          <span className="w-2.5 h-0.5 bg-slate-800" />
        </button>
      </div>
    </div>
  );
}
