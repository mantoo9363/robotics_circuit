'use client';

import dynamic from 'next/dynamic';
import type { EditorProps } from '@monaco-editor/react';

const MonacoEditorInner = dynamic(() => import('@monaco-editor/react').then((m) => m.default), {
  ssr: false,
});

export function MonacoEditor(props: EditorProps) {
  return <MonacoEditorInner {...props} />;
}
