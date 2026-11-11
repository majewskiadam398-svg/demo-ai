"use client";
import { useEffect, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export default function Home() {
  const [token,setToken] = useState("");
  const [username,setUsername] = useState("");
  const [password,setPassword] = useState("");
  const [mode,setMode] = useState<"login"|"register">("login");
  const [game,setGame] = useState(new Chess());
  const [history,setHistory] = useState<any[]>([]);
  const [predictions,setPredictions] = useState<any[]>([]);
  const [evaluation,setEvaluation] = useState<any>(null);
  const [analysisBusy,setAnalysisBusy] = useState(false);
  const [message,setMessage] = useState("Zaloguj się lub utwórz konto, aby zapisywać partie.");
  const [busy,setBusy] = useState(false);

  async function request(path:string, body?:any) {
    const res = await fetch(API+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
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
  useEffect(()=>{ if(token) request("/games").then(setHistory).catch((e)=>setMessage(e.message)); },[token]);

  async function analyzeFen(fen:string) {
    setAnalysisBusy(true);
    try {
      const data = await request("/ai/analyze",{fen});
      setPredictions(data.best_moves || []);
      setEvaluation(data);
    } catch(e:any) {
      setPredictions([]);
      setEvaluation(null);
      setMessage("Analiza: "+e.message);
    } finally { setAnalysisBusy(false); }
  }

  // Automatic analysis after every position change; no button is needed.
  useEffect(()=>{
    const fen = game.fen();
    const timer = setTimeout(()=>{ analyzeFen(fen); },250);
    return ()=>clearTimeout(timer);
  },[game]);

  function onDrop(source:string,target:string) {
    const next = new Chess(game.fen());
    try { next.move({from:source,to:target,promotion:"q"}); setGame(next); return true; }
    catch { return false; }
  }
  async function save() {
    try {
      const pgn=game.pgn() || '[Event "ChessMind AI"]\n\n*';
      const saved=await request("/games",{pgn,result:game.isCheckmate()?(game.turn()==="w"?"0-1":"1-0"):"*"});
      setHistory([saved,...history]); setMessage("Partia zapisana na koncie.");
    } catch(e:any){setMessage(e.message);}
  }
  function reset(){setGame(new Chess());setPredictions([]);setEvaluation(null);}
  const arrows = predictions.map((p:any)=>[p.from,p.to,p.color] as [any, any, any]);
  return <main className="shell">
    <header><div className="brand"><span className="mark">♞</span><div><b>ChessMind <i>AI</i></b><small>ANALIZA • PREDYKCJA • ROZWÓJ</small></div></div><span className="status">● SYSTEM MVP</span></header>
    <section className="hero"><div><p className="eyebrow">TWOJE SZACHY. GŁĘBSZE ZROZUMIENIE.</p><h1>Myśl kilka ruchów<br/><em>przed przeciwnikiem.</em></h1><p className="sub">Analizuj partie, poznawaj wzorce ludzkich decyzji i buduj własny profil treningowy.</p></div>
    {!token ? <div className="auth panel"><div className="tabs"><button className={mode==="login"?"active":""} onClick={()=>setMode("login")}>Logowanie</button><button className={mode==="register"?"active":""} onClick={()=>setMode("register")}>Rejestracja</button></div><label>Nick użytkownika</label><input value={username} onChange={e=>setUsername(e.target.value)} placeholder="np. KnightFox" autoComplete="username"/><label>Hasło (min. 10 znaków)</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••" autoComplete={mode==="login"?"current-password":"new-password"}/><button className="primary wide" disabled={busy} onClick={auth}>{busy?"Chwila...":mode==="login"?"Zaloguj się":"Utwórz konto"}</button><p className="hint">Bez adresu e-mail. Nick musi być unikalny.</p></div>
    : <div className="panel account"><span className="eyebrow">SESJA AKTYWNA</span><h2>{username}</h2><p>Twoje partie są przechowywane oddzielnie.</p><button className="ghost" onClick={()=>{setToken("");setHistory([]);}}>Wyloguj</button></div>}
    </section>
    <section className="workspace">
      <div className="board-panel panel"><div className="section-head"><div><span className="eyebrow">STUDIO ANALIZY</span><h2>Szachownica</h2></div><span className="live">● LIVE</span></div>
      <div className="board"><Chessboard position={game.fen()} onPieceDrop={onDrop} customArrows={arrows} boardWidth={Math.min(520, typeof window!=="undefined"?window.innerWidth-48:520)} /></div>
      <div className="controls"><button className="ghost" onClick={()=>{const n=new Chess(game.fen());n.undo();setGame(n);}}>↶ Cofnij</button><button className="ghost" onClick={reset}>Nowa partia</button><button className="ghost" onClick={save} disabled={!token}>Zapisz partię</button></div>
      <p className="notice">{analysisBusy?"ChessMind analizuje pozycję…":message}</p></div>
      <aside className="side">
        <div className="panel insight"><span className="eyebrow">CHESSMIND NATIVE ENGINE</span><h2>Analiza na żywo</h2><p className="muted">Własne przeszukiwanie wariantów i ocena pozycji. Odświeża się automatycznie po każdym ruchu.</p>
          {predictions.length?predictions.map((p:any)=><div className="prediction" key={p.san}><b>{p.rank}. {p.san}</b><strong>{p.score>0?"+":""}{p.score}</strong><small>{p.quality}</small></div>):<div className="empty">{analysisBusy?"Liczenie wariantów…":"Brak legalnych ruchów do analizy."}</div>}
          {evaluation&&<div className="eval"><span>Ocena pozycji (białe)</span><b>{evaluation.evaluation_cp>0?"+":""}{(evaluation.evaluation_cp/100).toFixed(2)}</b><small>Głębokość: {evaluation.depth} • {evaluation.engine}</small></div>}
        </div>
        <div className="panel history"><span className="eyebrow">TWOJE ARCHIWUM</span><h2>Ostatnie partie</h2>{history.length?history.slice(0,5).map(g=><div className="game-row" key={g.id}><span>Partia #{g.id}</span><b>{g.result}</b></div>):<div className="empty">Zapisane partie pojawią się tutaj.</div>}</div>
      </aside>
    </section>
    <footer>CHESSMIND AI <span>Własny silnik • analiza eksperymentalna</span></footer>
  </main>;
}
