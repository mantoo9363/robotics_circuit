"use client";

import { Activity, Cpu, Radio, TriangleAlert } from "lucide-react";
import { useCircuitStore } from "@cs/lib/store";

function StatCard({
  label,
  value,
  accent,
  light,
}: {
  label: string;
  value: string;
  accent: string;
  light: boolean;
}) {
  return (
    <div
      className={
        light
          ? "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          : "rounded-2xl border border-white/8 bg-white/5 p-4"
      }
    >
      <div
        className={
          light
            ? "text-[11px] uppercase tracking-[0.24em] text-slate-500"
            : "text-[11px] uppercase tracking-[0.24em] text-slate-400"
        }
      >
        {label}
      </div>

      <div className={`mt-2 text-2xl font-semibold ${accent}`}>{value}</div>
    </div>
  );
}

export function SimulationPanel({
  variant = "dark",
}: {
  variant?: "dark" | "light";
}) {
  const light = variant === "light";

  const simulationFrame = useCircuitStore((state) => state.simulationFrame);

  const simulationStatus = useCircuitStore((state) => state.simulationStatus);

  const simulationBackendConnected = useCircuitStore(
    (state) => state.simulationBackendConnected,
  );

  const simulationError = useCircuitStore((state) => state.simulationError);

  const activePins =
    simulationFrame?.boardPins.filter((pin) => pin.active).length ?? 0;

  const activeComponents = simulationFrame
    ? Object.values(simulationFrame.components).filter(
      (component) => component.isPowered,
    ).length
    : 0;

  const boardLabel =
    simulationFrame?.boardType === "arduino"
      ? "Arduino Uno"
      : simulationFrame?.boardType === "pico"
        ? "Raspberry Pi Pico"
        : "Passive circuit";

  const hotComponents = simulationFrame
    ? Object.values(simulationFrame.components)
      .filter((component) => component.isPowered)
      .slice(0, 4)
    : [];

  return (
    <section
      className={
        light
          ? "flex flex-col gap-4 rounded-[28px] border border-slate-200/90 bg-[#f7fbff] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.12)]"
          : "flex flex-col gap-4 rounded-[28px] border border-white/8 bg-[#0d1728] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.28)]"
      }
    >
      {/* TOP RIGHT BOARD LABEL */}
      <div className="flex justify-end">
        <div
          className={
            light
              ? "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
              : "rounded-full border border-white/8 bg-white/5 px-3 py-1 text-xs text-slate-200"
          }
        >
          {boardLabel}
        </div>
      </div>

      {/* STATS */}
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard
          light={light}
          label="Socket Link"
          value={simulationBackendConnected ? "Online" : "Offline"}
          accent={
            simulationBackendConnected
              ? light
                ? "text-emerald-600"
                : "text-emerald-300"
              : light
                ? "text-rose-600"
                : "text-rose-300"
          }
        />

        <StatCard
          light={light}
          label="Active Pins"
          value={String(activePins)}
          accent={light ? "text-cyan-700" : "text-cyan-200"}
        />

        <StatCard
          light={light}
          label="Components Live"
          value={String(activeComponents)}
          accent={light ? "text-amber-700" : "text-amber-200"}
        />
      </div>

      {/* CONTENT */}
      <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
        {/* LIVE COMPONENTS */}
        <div
          className={
            light
              ? "rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm"
              : "rounded-2xl border border-white/8 bg-slate-950/40 p-4"
          }
        >
          <div
            className={
              light
                ? "flex items-center gap-2 text-sm font-medium text-slate-800"
                : "flex items-center gap-2 text-sm font-medium text-slate-100"
            }
          >
            <Activity
              size={16}
              className={light ? "text-cyan-600" : "text-cyan-300"}
            />
            Live components
          </div>

          <div className="mt-3 space-y-2">
            {hotComponents.length === 0 ? (
              <div
                className={
                  light
                    ? "rounded-xl border border-dashed border-slate-300 px-3 py-6 text-sm text-slate-500"
                    : "rounded-xl border border-dashed border-white/10 px-3 py-6 text-sm text-slate-400"
                }
              >
                Start the simulation to stream component telemetry into the
                editor and 3D viewer.
              </div>
            ) : (
              hotComponents.map((component) => (
                <div
                  key={component.nodeId}
                  className={
                    light
                      ? "flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                      : "flex items-center justify-between rounded-xl border border-white/8 bg-white/5 px-3 py-2.5"
                  }
                >
                  <div>
                    <div
                      className={
                        light
                          ? "text-sm font-medium text-slate-900"
                          : "text-sm font-medium text-white"
                      }
                    >
                      {component.label}
                    </div>

                    <div
                      className={
                        light
                          ? "text-xs text-slate-500"
                          : "text-xs text-slate-400"
                      }
                    >
                      {component.componentType}
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={
                        light
                          ? "text-sm text-cyan-800"
                          : "text-sm text-cyan-100"
                      }
                    >
                      {component.voltage.toFixed(2)} V
                    </div>

                    <div
                      className={
                        light
                          ? "text-xs text-slate-500"
                          : "text-xs text-slate-400"
                      }
                    >
                      {(component.brightness * 100).toFixed(0)}% drive
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RUNTIME STATUS */}
        <div
          className={
            light
              ? "rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm"
              : "rounded-2xl border border-white/8 bg-slate-950/40 p-4"
          }
        >
          <div
            className={
              light
                ? "flex items-center gap-2 text-sm font-medium text-slate-800"
                : "flex items-center gap-2 text-sm font-medium text-slate-100"
            }
          >
            <Radio
              size={16}
              className={light ? "text-emerald-600" : "text-emerald-300"}
            />
            Runtime status
          </div>

          <div
            className={
              light
                ? "mt-3 space-y-3 text-sm text-slate-600"
                : "mt-3 space-y-3 text-sm text-slate-300"
            }
          >
            <div
              className={
                light
                  ? "flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  : "flex items-center justify-between rounded-xl border border-white/8 bg-white/5 px-3 py-2"
              }
            >
              <span>Status</span>

              <span
                className={
                  light
                    ? "font-medium capitalize text-slate-900"
                    : "font-medium capitalize text-white"
                }
              >
                {simulationStatus}
              </span>
            </div>

            <div
              className={
                light
                  ? "flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  : "flex items-center justify-between rounded-xl border border-white/8 bg-white/5 px-3 py-2"
              }
            >
              <span>Latest tick</span>

              <span
                className={
                  light
                    ? "font-medium text-slate-900"
                    : "font-medium text-white"
                }
              >
                {simulationFrame ? simulationFrame.tick : "n/a"}
              </span>
            </div>

            <div
              className={
                light
                  ? "flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  : "flex items-center justify-between rounded-xl border border-white/8 bg-white/5 px-3 py-2"
              }
            >
              <span>Serial lines</span>

              <span
                className={
                  light
                    ? "font-medium text-slate-900"
                    : "font-medium text-white"
                }
              >
                {simulationFrame?.serialOutput.length ?? 0}
              </span>
            </div>

            {simulationError ? (
              <div
                className={
                  light
                    ? "rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-rose-900"
                    : "rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-3 text-rose-100"
                }
              >
                <div className="flex items-center gap-2 font-medium">
                  <TriangleAlert size={15} />
                  Backend error
                </div>

                <div
                  className={
                    light
                      ? "mt-1 text-xs text-rose-800"
                      : "mt-1 text-xs text-rose-100/90"
                  }
                >
                  {simulationError}
                </div>
              </div>
            ) : (
              <div
                className={
                  light
                    ? "rounded-xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50 to-sky-50 px-3 py-3 text-slate-700"
                    : "rounded-xl border border-white/8 bg-gradient-to-br from-cyan-500/10 to-sky-500/5 px-3 py-3 text-slate-200"
                }
              >
                <div className="flex items-center gap-2 font-medium">
                  <Cpu
                    size={15}
                    className={light ? "text-cyan-700" : "text-cyan-200"}
                  />
                  Shared-state guarantee
                </div>

                <div
                  className={
                    light
                      ? "mt-1 text-xs text-slate-600"
                      : "mt-1 text-xs text-slate-300"
                  }
                >
                  The 2D editor and 3D viewer subscribe to the exact same
                  streamed frame payload.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
