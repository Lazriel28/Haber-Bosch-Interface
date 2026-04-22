/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef, memo, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { 
  Thermometer, Gauge, Waves, Factory, Info, 
  BrainCircuit, ChevronsRight, RefreshCcw, Activity, Droplets
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Scenario, SimulationState } from './types.ts';
import { getEquilibriumAnalysis } from './geminiService.ts';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Optimized Molecule Visualizer (Memoized)
const MoleculeVisualizer = memo(({ count, type, color, speed, sizeMultiplier = 1 }: { count: number, type: string, color: string, speed: number, sizeMultiplier?: number }) => {
  return (
    <div className="relative w-full h-32 overflow-hidden bg-slate-900/40 rounded-2xl border border-white/5 shadow-inner">
      <div className="absolute top-2 left-3 text-[9px] uppercase font-mono text-slate-500 tracking-[0.2em] z-10">{type}</div>
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(#38bdf8 1px, transparent 1px)', backgroundSize: '16px 16px' }}></div>
      {Array.from({ length: Math.min(Math.floor(count), 30) }).map((_, i) => (
        <motion.div
          key={i}
          className={cn("absolute rounded-full", color)}
          style={{
            width: (type.includes('2') || type.includes('3') ? 6 : 3) * sizeMultiplier,
            height: (type.includes('2') || type.includes('3') ? 6 : 3) * sizeMultiplier,
            left: `${(i * 137.5) % 90}%`,
            top: `${(i * 57.3) % 80}%`,
            filter: 'blur(0.5px)',
            boxShadow: `0 0 5px ${color.includes('indigo') ? '#6366f1' : color.includes('cyan') ? '#22d3ee' : '#38bdf8'}`
          }}
          animate={{
            x: [0, (Math.sin(i * 0.5) * 20), 0],
            y: [0, (Math.cos(i * 0.5) * 20), 0],
          }}
          transition={{
            duration: (1.5 + (i % 3)) / (speed + 0.1),
            repeat: Infinity,
            ease: "linear"
          }}
        />
      ))}
    </div>
  );
});

// Memoized Chart for Performance
const ConcentrationChart = memo(({ history, scenario }: { history: any[], scenario: Scenario }) => {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(148,163,184,0.05)" />
        <XAxis dataKey="time" hide />
        <YAxis domain={[0, 1]} hide />
        <Tooltip 
          contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', fontSize: '9px' }}
          isAnimationActive={false}
        />
        <Line 
          type="monotone" 
          dataKey="rA" 
          stroke="#6366f1" 
          strokeWidth={2} 
          dot={false} 
          isAnimationActive={false} 
          name={scenario === Scenario.HABER_BOSCH ? "N₂" : "CO₂"}
        />
        <Line 
          type="monotone" 
          dataKey="rB" 
          stroke="#22d3ee" 
          strokeWidth={2} 
          dot={false} 
          isAnimationActive={false} 
          name={scenario === Scenario.HABER_BOSCH ? "H₂" : "H₂O"}
        />
        <Line 
          type="monotone" 
          dataKey="p" 
          stroke="#38bdf8" 
          strokeWidth={4} 
          dot={false} 
          isAnimationActive={false} 
          strokeLinecap="round" 
          name={scenario === Scenario.HABER_BOSCH ? "NH₃" : "H⁺"}
        />
      </LineChart>
    </ResponsiveContainer>
  );
});

export default function App() {
  const [scenario, setScenario] = useState<Scenario>(Scenario.HABER_BOSCH);
  
  // React state only for what needs to trigger re-renders
  const [state, setState] = useState<SimulationState>({
    temperature: 0.5,
    pressure: 0.5,
    reactantA: 0.5,
    reactantB: 0.5,
    product: 0.2,
  });

  const [history, setHistory] = useState<{ time: number, rA: number, rB: number, p: number }[]>([]);
  const [aiInsight, setAiInsight] = useState<{ explanation: string, complexityInsight: string } | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  
  // High-frequency simulation logic
  const stateRef = useRef(state);
  const targetPRef = useRef(0.2);
  const historyRef = useRef<{ time: number, rA: number, rB: number, p: number }[]>([]);
  const requestRef = useRef<number>(0);
  const tickCounter = useRef<number>(0);

  // Update target equilibrium IMMEDIATELY based on raw state
  useEffect(() => {
    stateRef.current = state;
    const s = state;
    let target = 0.2;
    if (scenario === Scenario.HABER_BOSCH) {
      const tempInfluence = Math.exp(-2 * (s.temperature - 0.2)) * 0.5; 
      const pressureInfluence = Math.pow(s.pressure + 0.5, 1.5) * 0.6;
      const concentrationInfluence = (s.reactantA * 0.4 + s.reactantB * 0.6);
      target = Math.min(Math.max(tempInfluence * pressureInfluence * concentrationInfluence, 0.05), 0.95);
    } else {
      const co2Influence = s.reactantA * 1.5;
      const tempSolubility = 1 - (s.temperature * 0.5);
      target = Math.min(Math.max(co2Influence * tempSolubility * 0.4, 0.05), 0.95);
    }
    targetPRef.current = target;
  }, [state.temperature, state.pressure, state.reactantA, state.reactantB, scenario]);

  const animate = () => {
    const driftRate = scenario === Scenario.HABER_BOSCH 
      ? (0.01 + stateRef.current.temperature * 0.04) 
      : 0.03;

    const currentP = stateRef.current.product;
    const targetP = targetPRef.current;
    const delta = (targetP - currentP) * driftRate;

    // Update simulation ref (0 lag)
    stateRef.current.product = currentP + delta;
    stateRef.current.reactantA = Math.max(stateRef.current.reactantA - delta * 0.3, 0.01);
    stateRef.current.reactantB = Math.max(stateRef.current.reactantB - delta * 0.3, 0.01);

    tickCounter.current++;

    // Throttled UI state sync (still high frequency enough for smooth lines)
    if (tickCounter.current % 3 === 0) {
      const newEntry = { 
        time: tickCounter.current, 
        rA: stateRef.current.reactantA, 
        rB: stateRef.current.reactantB, 
        p: stateRef.current.product 
      };
      
      // Update local history for the graph
      historyRef.current = [...historyRef.current, newEntry].slice(-80);
      
      // Batch these updates to the React cycle
      // Using Functional Update to ensure accuracy
      if (tickCounter.current % 6 === 0) {
        setHistory(historyRef.current);
        // Only update 'product' in state to sync visual gauges if needed, 
        // but simulation ref is the source of truth for sliders
        setState(prev => ({
          ...prev,
          product: stateRef.current.product,
          reactantA: stateRef.current.reactantA,
          reactantB: stateRef.current.reactantB
        }));
      }
    }

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [scenario]);

  const handleAiAnalysis = async () => {
    setLoadingAi(true);
    const result = await getEquilibriumAnalysis(scenario, state);
    setAiInsight(result);
    setLoadingAi(false);
  };

  const resetSimulation = () => {
    const base = { temperature: 0.5, pressure: 0.5, reactantA: 0.5, reactantB: 0.5, product: 0.1 };
    setState(base);
    stateRef.current = { ...base };
    historyRef.current = [];
    setHistory([]);
    setAiInsight(null);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 font-sans selection:bg-cyan-500/30 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 p-4 flex justify-between items-end bg-slate-950/80 backdrop-blur-lg z-20">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
             <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
             <span className="text-[9px] font-mono uppercase tracking-[0.4em] text-slate-500">Equilibrium Simulation Node</span>
          </div>
          <h1 className="text-xl font-light tracking-tight">
            {scenario === Scenario.HABER_BOSCH ? "Industrial Haber-Bosch" : "Ocean Carbonate"}{" "}
            <span className="font-bold text-accent-blue tracking-tighter">Flux Interface</span>
          </h1>
        </div>
        <div className="flex flex-col items-end text-right">
          <div className="text-sm font-mono text-slate-400 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded">
            {scenario === Scenario.HABER_BOSCH ? "N₂ + 3H₂ ⇌ 2NH₃" : "CO₂ + H₂O ⇌ H⁺ + HCO₃⁻"}
          </div>
          <div className="text-[8px] text-slate-600 font-mono uppercase tracking-[0.2em] mt-1.5">
            Real-Time Processing • Latency: &lt;1ms
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 p-5 overflow-y-auto custom-scrollbar">
        <div className="flex gap-2.5 mb-5 items-center">
          {Object.values(Scenario).map((s) => (
            <button
              key={s}
              onClick={() => { setScenario(s); resetSimulation(); }}
              className={cn(
                "px-5 py-2 text-[9px] uppercase font-black tracking-[0.2em] rounded-full border transition-all duration-300",
                scenario === s 
                  ? "bg-accent-blue/10 text-accent-blue border-accent-blue/50 shadow-[0_0_20px_rgba(56,189,248,0.15)]" 
                  : "bg-slate-900/50 text-slate-600 border-white/5 hover:border-slate-700"
              )}
            >
              {s}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-4 text-slate-500 font-mono text-[8px] uppercase tracking-widest opacity-50">
             <div className="flex items-center gap-1.5">
                <Activity className="w-3 h-3" />
                <span>CPU: Balanced</span>
             </div>
             <div className="flex items-center gap-1.5">
                <RefreshCcw className="w-3 h-3" />
                <span>Buffer: Active</span>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-fit lg:h-[calc(100vh-180px)]">
          
          {/* Controls Panel */}
          <aside className="lg:col-span-3 h-full flex flex-col gap-5">
            <div className="glass p-5 rounded-3xl space-y-6 flex-1 overflow-y-auto no-scrollbar border-white/5">
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] flex items-center gap-2">
                <Gauge className="w-4 h-4 text-cyan-400" />
                Stressor Matrix
              </h2>
              <div className="space-y-6">
                <ControlSlider 
                  label="Thermal Vector" 
                  icon={<Thermometer className="w-3 h-3" />}
                  value={state.temperature} 
                  onChange={(v) => setState(s => ({ ...s, temperature: v }))} 
                  color="bg-orange-500"
                  suffix="K"
                />
                <ControlSlider 
                  label="Pressure Load" 
                  icon={<Activity className="w-3 h-3" />}
                  value={state.pressure} 
                  onChange={(v) => setState(s => ({ ...s, pressure: v }))} 
                  color="bg-blue-500"
                  suffix="ATM"
                />
                <div className="h-px bg-white/5 mx-2" />
                <ControlSlider 
                  label={scenario === Scenario.HABER_BOSCH ? "Nitrogen [N₂]" : "Atmospheric CO₂"} 
                  value={state.reactantA} 
                  onChange={(v) => setState(s => ({ ...s, reactantA: v }))} 
                  color="bg-indigo-500"
                  suffix="M"
                />
                <ControlSlider 
                  label={scenario === Scenario.HABER_BOSCH ? "Hydrogen [H₂]" : "Ocean Solvency"} 
                  value={state.reactantB} 
                  onChange={(v) => setState(s => ({ ...s, reactantB: v }))} 
                  color="bg-cyan-600"
                  suffix="M"
                />
              </div>

              <div className="p-4 bg-slate-950/40 rounded-2xl border border-white/5">
                 <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Le Châtelier Protocol</p>
                 <p className="text-[11px] text-slate-400 leading-tight">
                    {scenario === Scenario.HABER_BOSCH 
                      ? "High pressure (4 to 2 moles) favors ammonia. Heat (exothermic) shifts left." 
                      : "Rising CO₂ drives carbonic acid production, resulting in ionic depletion."}
                 </p>
              </div>

              <button 
                onClick={resetSimulation}
                className="w-full py-3.5 bg-slate-800/80 text-slate-400 text-[10px] uppercase font-bold tracking-[0.2em] rounded-2xl hover:bg-slate-700 hover:text-slate-100 transition-all border border-white/5 active:scale-95"
              >
                Reset System State
              </button>
            </div>
          </aside>

          {/* Visualization Area */}
          <section className="lg:col-span-6 h-full flex flex-col gap-5">
            <div className="glass p-5 rounded-3xl flex-1 flex flex-col border-white/5 min-h-[300px]">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Concentration Flux</h2>
                <div className="flex gap-4">
                   <LegendItem color="bg-indigo-500" label={scenario === Scenario.HABER_BOSCH ? "N₂" : "CO₂"} />
                   <LegendItem color="bg-cyan-400" label={scenario === Scenario.HABER_BOSCH ? "H₂" : "H₂O"} />
                   <LegendItem color="bg-accent-blue" label={scenario === Scenario.HABER_BOSCH ? "NH₃" : "H⁺"} />
                </div>
              </div>
              
              <div className="flex-1 relative">
                <ConcentrationChart history={history} scenario={scenario} />
                
                {/* Current Shift Indicator Overlay */}
                <div className="absolute top-2 right-2 p-3 bg-slate-950/80 border border-white/10 rounded-2xl backdrop-blur-md pointer-events-none">
                   <div className="flex items-center gap-3">
                      <motion.div 
                        animate={{ 
                          rotate: (state.product > history[history.length-2]?.p) ? 0 : 180,
                        }}
                        className={cn("p-1.5 rounded-full transition-colors", state.product > (history[history.length-2]?.p || 0) ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400")}
                      >
                        <ChevronsRight className="w-5 h-5" />
                      </motion.div>
                      <div>
                         <div className="text-[8px] font-bold uppercase tracking-widest text-slate-500">Vector</div>
                         <div className="text-xs font-bold">{state.product > (history[history.length-2]?.p || 0) ? "SHIFT RIGHT" : "SHIFT LEFT"}</div>
                      </div>
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-6">
                 <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                    <h3 className="text-[9px] font-black text-slate-500 uppercase mb-2">Molecular Dynamics</h3>
                    <div className="flex gap-2">
                       <MoleculeVisualizer 
                          count={state.reactantA * 20} 
                          type="A" 
                          color="bg-indigo-500" 
                          speed={state.temperature}
                        />
                       <MoleculeVisualizer 
                          count={state.product * 20} 
                          type="Prod" 
                          color="bg-accent-blue" 
                          speed={state.temperature}
                        />
                    </div>
                 </div>
                 <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex flex-col justify-center">
                    <h3 className="text-[9px] font-black text-slate-500 uppercase mb-2">Efficiency Rating</h3>
                    <div className="text-4xl font-light tracking-tighter text-cyan-400 mb-1">
                       {Math.round(state.product * 100)}<span className="text-sm uppercase font-mono">%</span>
                    </div>
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                       <motion.div 
                          className="h-full bg-cyan-400"
                          animate={{ width: `${state.product * 100}%` }}
                          transition={{ duration: 0.1 }}
                        />
                    </div>
                 </div>
              </div>
            </div>
          </section>

          {/* Analysis View */}
          <aside className="lg:col-span-3 h-full flex flex-col gap-5">
            <div className="glass p-5 rounded-3xl flex-1 flex flex-col border-white/5">
               <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-amber-500/10 rounded-xl">
                    <BrainCircuit className="w-5 h-5 text-amber-500" />
                  </div>
                  <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">AI Synthesis</h2>
               </div>

               <div className="flex-1 space-y-6 overflow-y-auto pr-1 no-scrollbar text-slate-400">
                  <div className="space-y-3">
                     <p className="text-[11px] leading-relaxed italic border-l border-amber-500/30 pl-3">
                        {aiInsight ? `"${aiInsight.explanation}"` : "Sensor array active. Request state synthesis to evaluate industrial and environmental complexities."}
                     </p>
                  </div>
                  
                  {aiInsight && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-slate-950/40 rounded-2xl border border-white/5 space-y-2">
                       <span className="text-[8px] font-bold text-amber-500 uppercase tracking-widest">Honors Insight</span>
                       <p className="text-[10px] leading-relaxed">{aiInsight.complexityInsight}</p>
                    </motion.div>
                  )}

                  <div className="pt-4 border-t border-white/5 space-y-4">
                     <div className="flex items-center gap-2">
                        <Waves className="w-3.5 h-3.5 text-blue-400" />
                        <h3 className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Real-World Context</h3>
                     </div>
                     <p className="text-[10px] leading-relaxed">
                        {scenario === Scenario.HABER_BOSCH 
                          ? "Haber-Bosch provides 50% of human nitrogen via fertilizer. Optimization requires balancing yield against massive energy consumption (1% of global total)." 
                          : "Carbonate ions are essential for calcifying organisms. Rising CO₂ reduces availability, threatening coral reefs and global food chains."}
                     </p>
                  </div>
               </div>

               <div className="mt-8 pt-5 border-t border-white/5">
                  <button 
                    onClick={handleAiAnalysis}
                    disabled={loadingAi}
                    className="w-full py-4 bg-cyan-500 text-slate-950 text-[10px] uppercase font-black tracking-[0.3em] rounded-2xl hover:bg-cyan-400 transition-all shadow-lg shadow-cyan-900/20 active:scale-95 disabled:opacity-30"
                  >
                    {loadingAi ? "Synthesizing..." : "Run Analysis"}
                  </button>
               </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Mini Status Bar */}
      <footer className="border-t border-white/5 px-6 py-2.5 flex justify-between items-center text-[9px] font-mono text-slate-600 bg-slate-950/80 backdrop-blur-md">
        <div className="flex gap-6 items-center">
           <div className="flex items-center gap-1.5"><Activity className="w-3 h-3 text-cyan-400" /> FLOW: STABLE</div>
           <div className="flex items-center gap-1.5"><Droplets className="w-3 h-3 text-indigo-400" /> SOLVENCY: 1.0M</div>
        </div>
        <div className="uppercase tracking-[0.3em] opacity-40">Equilibrium Labs • Computation v2.1</div>
      </footer>
    </div>
  );
}

function LegendItem({ color, label }: { color: string, label: string }) {
  return (
    <div className="flex items-center space-x-1.5">
      <span className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor]", color.replace("bg-", "text-"))} style={{ backgroundColor: 'currentColor' }}></span>
      <span className="text-[8px] font-bold uppercase text-slate-500 tracking-tighter">{label}</span>
    </div>
  );
}

function ControlSlider({ label, value, onChange, color, icon, suffix }: { 
  label: string, 
  value: number, 
  onChange: (v: number) => void, 
  color: string,
  icon?: ReactNode,
  suffix?: string
}) {
  return (
    <div className="space-y-2.5 overflow-hidden">
      <div className="flex justify-between items-center">
        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
          <span className="opacity-50">{icon}</span>
          {label}
        </label>
        <div className="text-[9px] font-mono text-accent-blue bg-white/5 px-1.5 rounded">
           {Math.round(value * 100)}<span className="opacity-40 ml-0.5">{suffix}</span>
        </div>
      </div>
      <div className="relative group">
        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-1 appearance-none bg-slate-800 rounded-full cursor-grab active:cursor-grabbing accent-accent-blue"
        />
        <div className="absolute -top-1.5 -bottom-1.5 left-0 right-0 pointer-events-none opacity-0 group-hover:opacity-100 bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent transition-opacity" />
      </div>
    </div>
  );
}
