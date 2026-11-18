export default function SerialMonitor({ logs }: any) {
  return (
    <div className="bg-black text-green-400 p-3 h-48 overflow-auto font-mono">
      {logs.map((log: string, index: number) => (
        <div key={index}>{log}</div>
      ))}
    </div>
  );
}