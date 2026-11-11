"use client";
import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export default function Home() {
  const [token,setToken] = useState("");
  const [isAdmin,setIsAdmin] = useState(false);
  const [username,setUsername] = useState("");
  const [password,setPassword] = useState("");
  const [mode,setMode] = useState<"login"|"register">("login");
  const [game,setGame] = useState(new Chess());
  const [history,setHistory] = useState<any[]>([]);
  const [predictions,setPredictions] = useState<any[]>([]);
  const [evaluation,setEvaluation] = useState<any>(null);
  const [analysisBusy,setAnalysisBusy] = useState(false);\n  const [training,setTraining] = useState(false);\n  const [difficulty,setDifficulty] = useState("easy");\n  const [trainingModel,setTrainingModel] = useState("balanced");\n  const [trainingBusy,setTrainingBusy] = useState(false);\n  const [coachText,setCoachText] = useState("Włącz trening, aby zagrać białymi przeciwko ChessMind AI.");\n  const [hint,setHint] = useState<any>(null);
  const [message,setMessage] = useState("Zaloguj się lub utwórz konto, aby zapisywać partie.");
  const [busy,setBusy] = useState(false);
  const analysisId = useRef(0);

  async function request(path:string, body?:any, signal?:AbortSignal) {
    const res = await fetch(API+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined,signal});
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.detail || "Wystąpił błąd");
    return data;
  }
  async function auth() {
    setBusy(true);
    try {
      const data = await request(`/auth/${mode}`,{username,password});
      setToken(data.access_token); setMessage("Zalogowano pomyślnie.");
    } catch(e:any) { setMessage(e.message); } finally { setBusy(false); }
  }
  useEffect(()=>{
    if(!token){setIsAdmin(false);return;}
    request("/me").then((data)=>setIsAdmin(data.is_admin === true)).catch((e)=>{setIsAdmin(false);setMessage(e.message);});
    request("/games").then(setHistory).catch((e)=>setMessage(e.message));
  },[token]);

  async function analyzeFen(fen:string, id:number, signal:AbortSignal, didTimeout:()=>boolean) {
    setAnalysisBusy(true);
    try {
      const data = await request("/ai/analyze",{fen},signal);
      if(id !== analysisId.current) return;
      setPredictions(data.best_moves || []);
      setEvaluation(data);
      setMessage("Analiza aktualna.");
    } catch(e:any) {
      if(id !== analysisId.current) return;
      setPredictions([]);
      setEvaluation(null);
      setMessage(didTimeout()
        ? "Analiza przekroczyła 15 sekund. Spróbuj wykonać ruch ponownie."
        : e.name === "AbortError" ? "Analiza została anulowana." : "Analiza: "+e.message);
    } finally {
      if(id === analysisId.current) setAnalysisBusy(false);
    }
  }

  // One request per latest position. Old requests are aborted and stale responses ignored.
  useEffect(()=>{
    if(!isAdmin){setPredictions([]);setEvaluation(null);setAnalysisBusy(false);return;}
    const id = ++analysisId.current;
    const fen = game.fen();
    const controller = new AbortController();
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const debounce = setTimeout(()=>{
      timeout = setTimeout(()=>{ timedOut = true; controller.abort(); },15000);
      void analyzeFen(fen,id,controller.signal,()=>timedOut).finally(()=>{
        if(timeout) clearTimeout(timeout);
      });
    },250);
    return ()=>{
      clearTimeout(debounce);
      if(timeout) clearTimeout(timeout);
      controller.abort();
    };
  },[game,isAdmin]);

  function onDrop(source:string,target:string) {
    const next = new Chess(game.fen());
    try { next.move({from:source,to:target,promotion:"q"}); setGame(next); return true; }
    catch { return false; }
  }
  async function save() {
    try {
      const pgn=game.pgn() || '[Event "ChessMind AI"]\\n\\n*';
      const saved=await request("/games",{pgn,result:game.isCheckmate()?(game.turn()==="w"?"0-1":"1-0"):"*"});
      setHistory([saved,...history]); setMessage("Partia zapisana na koncie.");
    } catch(e:any){setMessage(e.message);}
  }
  function reset(){setGame(new Chess());setPredictions([]);setEvaluation(null);setHint(null);setCoachText(training?"Nowa partia treningowa. Zagraj pierwszy ruch.":coachText);}
  const arrows = predictions.map((p:any)=>[p.from,p.to,p.color] as [any, any, any]);
  return <main className="shell">
    <header><div className="brand"><span className="mark">♞</span><div><b>ChessMind <i>AI</i></b><small>ANALIZA • PREDYKCJA • ROZWÓJ</small></div></div><span className="status">● SYSTEM MVP</span></header>
    <section className="hero"><div><p className="eyebrow">TWOJE SZACHY. GŁĘBSZE ZROZUMIENIE.</p><h1>Myśl kilka ruchów<br/><em>przed przeciwnikiem.</em></h1><p className="sub">Analizuj partie, poznawaj wzorce ludzkich decyzji i buduj własny profil treningowy.</p></div>
    {!token ? <div className="auth panel"><div className="tabs"><button className={mode==="login"?"active":""} onClick={()=>setMode("login")}>Logowanie</button><button className={mode==="register"?"active":""} onClick={()=>setMode("register")}>Rejestracja</button></div><label>Nick użytkownika</label><input value={username} onChange={e=>setUsername(e.target.value)} placeholder="np. KnightFox" autoComplete="username"/><label>Hasło (min. 10 znaków)</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••" autoComplete={mode==="login"?"current-password":"new-password"}/><button className="primary wide" disabled={busy} onClick={auth}>{busy?"Chwila...":mode==="login"?"Zaloguj się":"Utwórz konto"}</button><p className="hint">Bez adresu e-mail. Nick musi być unikalny.</p></div>
    : <div className="panel account"><span className="eyebrow">SESJA AKTYWNA</span><h2>{username}</h2><p className="hint">{isAdmin?"Administrator":"Konto użytkownika"}</p><p>Twoje partie są przechowywane oddzielnie.</p><button className="ghost" onClick={()=>{setToken("");setHistory([]);}}>Wyloguj</button></div>}
    </section>
    <section className="workspace">
      <div className="board-panel panel"><div className="section-head"><div><span className="eyebrow">STUDIO GRY</span><h2>Szachownica</h2></div><span className="live">● LIVE</span></div>
      <div className="board"><Chessboard position={game.fen()} onPieceDrop={onDrop} customArrows={arrows} boardWidth={Math.min(520, typeof window!=="undefined"?window.innerWidth-48:520)} /></div>
      <div className="controls"><button className="ghost" onClick={()=>{const n=new Chess(game.fen());n.undo();setGame(n);}}>↶ Cofnij</button><button className="ghost" onClick={reset}>Nowa partia</button><button className="ghost" onClick={save} disabled={!token}>Zapisz partię</button></div>
      <p className="notice">{analysisBusy?"ChessMind analizuje pozycję…":message}</p></div>
      <aside className="side">
        {isAdmin ? <div className="panel insight"><span className="eyebrow">PANEL ADMINISTRATORA</span><h2>Analiza na żywo</h2><p className="muted">Własne przeszukiwanie wariantów i ocena pozycji. Odświeża się automatycznie po każdym ruchu.</p>
          {predictions.length?predictions.map((p:any)=><div className="prediction" key={p.san}><b>{p.rank}. {p.san}</b><strong>{p.score>0?"+":""}{p.score}</strong><small>{p.quality}</small></div>):<div className="empty">{analysisBusy?"Liczenie wariantów…":evaluation?"Brak propozycji dla tej pozycji.":"Oczekiwanie na analizę pozycji."}</div>}
          {evaluation&&<div className="eval"><span>Ocena pozycji (białe)</span><b>{evaluation.evaluation_cp>0?"+":""}{(evaluation.evaluation_cp/100).toFixed(2)}</b><small>Głębokość: {evaluation.depth} • {evaluation.engine}</small></div>}
        </div>
        : <div className="panel insight"><span className="eyebrow">TRYB GRY</span><h2>Gra w szachy</h2><p className="muted">Analiza silnika jest dostępna wyłącznie na koncie administratora.</p><div className="empty">Wykonuj ruchy na szachownicy. Twoje partie możesz zapisywać na koncie.</div></div>}
        <div className="panel history"><span className="eyebrow">TWOJE ARCHIWUM</span><h2>Ostatnie partie</h2>{history.length?history.slice(0,5).map(g=><div className="game-row" key={g.id}><span>Partia #{g.id}</span><b>{g.result}</b></div>):<div className="empty">Zapisane partie pojawią się tutaj.</div>}</div>
      </aside>
    </section>
    <footer>CHESSMIND AI <span>Własny silnik • analiza eksperymentalna</span></footer>
  </main>;
}
