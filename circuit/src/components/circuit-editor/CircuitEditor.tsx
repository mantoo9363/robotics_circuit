'use client';

import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Toolbar } from './Toolbar';
import { Canvas } from './Canvas';
import { Sidebar } from './Sidebar';
import { PropertiesPanel } from './PropertiesPanel';
import { CodeEditor } from './CodeEditor';

export function CircuitEditor({ embedded = false }: { embedded?: boolean }) {
  const outerClass = embedded
    ? 'h-full w-full overflow-hidden bg-[#f4f5f6] text-slate-700'
    : 'h-screen w-screen overflow-hidden bg-[#f4f5f6] text-slate-700';
  const bodyClass = embedded
    ? 'relative z-0 grid h-[calc(100%-50px)] min-h-0 grid-cols-[minmax(0,1fr)_auto]'
    : 'relative z-0 grid h-[calc(100vh-50px)] min-h-0 grid-cols-[minmax(0,1fr)_auto]';

  return (
    <ReactFlowProvider>
      <div className={outerClass}>

        <Toolbar />

        <div className={bodyClass}>

          <section className="relative h-full min-h-0 overflow-hidden bg-[#f4f5f6]">

            <div className="relative h-full">

              <Canvas />

              <PropertiesPanel />

              <CodeEditor />

            </div>
          </section>

          <Sidebar />

        </div>
      </div>
    </ReactFlowProvider>
  );
}
