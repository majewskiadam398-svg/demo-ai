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
  const [message,setMessage] = useState("Zaloguj się lub utwórz konto, aby zapisywać partie.");
  const [busy,setBusy] = useState(false);
  const [isAdmin,setIsAdmin] = useState(false);
  const [nativeMoves,setNativeMoves] = useState<any[]>([]);

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
      setToken(data.access_token); setUsername(username); setMessage("Zalogowano pomyślnie.");
    } catch(e:any) { setMessage(e.message); } finally { setBusy(false); }
  }
  useEffect(()=>{ if(token) { request("/me").then((me)=>setIsAdmin(!!me.is_admin)).catch((e)=>setMessage(e.message)); request("/games").then(setHistory).catch((e)=>setMessage(e.message)); } else { setIsAdmin(false); } },[token]);
  function onDrop(source:string,target:string) {
    const next = new Chess(game.fen());
    try { next.move({from:source,to:target,promotion:"q"}); setGame(next); setPredictions([]); return true; }
    catch { return false; }
  }
  async function analyze() {
    try {
      if (isAdmin) {
        const data=await request("/ai/analyze",{fen:game.fen()});
        setNativeMoves(data.best_moves || []); setPredictions([]);
        setEvaluation({material_balance_white:(data.evaluation_cp/100).toFixed(2),note:`Własny silnik ChessMind • głębokość ${data.depth}`});
        setMessage("Analiza silnikiem ChessMind zakończona.");
      } else {
        const data=await request("/ai/predict",{fen:game.fen()});
        setPredictions(data.predictions); setNativeMoves([]); setEvaluation(data.evaluation); setMessage(data.warning);
      }
    } catch(e:any){setMessage(e.message);}
  }
  async function save() {
    try {
      const pgn=game.pgn() || '[Event "ChessMind AI"]\n\n*';
      const saved=await request("/games",{pgn,result:game.isCheckmate()?(game.turn()==="w"?"0-1":"1-0"):"*"});
      setHistory([saved,...history]); setMessage("Partia zapisana na koncie.");
    } catch(e:any){setMessage(e.message);}
  }
  function reset(){setGame(new Chess());setPredictions([]);setNativeMoves([]);setEvaluation(null);}
  return <main className="shell">
    <header><div className="brand"><span className="mark">♞</span><div><b>ChessMind <i>AI</i></b><small>ANALIZA • PREDYKCJA • ROZWÓJ</small></div></div><span className="status">● SYSTEM MVP</span></header>
    <section className="hero"><div><p className="eyebrow">TWOJE SZACHY. GŁĘBSZE ZROZUMIENIE.</p><h1>Myśl kilka ruchów<br/><em>przed przeciwnikiem.</em></h1><p className="sub">Analizuj partie, poznawaj wzorce ludzkich decyzji i buduj własny profil treningowy.</p></div>
    {!token ? <div className="auth panel"><div className="tabs"><button className={mode==="login"?"active":""} onClick={()=>setMode("login")}>Logowanie</button><button className={mode==="register"?"active":""} onClick={()=>setMode("register")}>Rejestracja</button></div><label>Nick użytkownika</label><input value={username} onChange={e=>setUsername(e.target.value)} placeholder="np. KnightFox" autoComplete="username"/><label>Hasło (min. 10 znaków)</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••••" autoComplete={mode==="login"?"current-password":"new-password"}/><button className="primary wide" disabled={busy} onClick={auth}>{busy?"Chwila...":mode==="login"?"Zaloguj się":"Utwórz konto"}</button><p className="hint">Bez adresu e-mail. Nick musi być unikalny.</p></div>
    : <div className="panel account"><span className="eyebrow">SESJA AKTYWNA</span><h2>{username}</h2><p>Twoje partie są przechowywane oddzielnie.</p><button className="ghost" onClick={()=>{setToken("");setHistory([]);}}>Wyloguj</button></div>}
    </section>
    <section className="workspace">
      <div className="board-panel panel"><div className="section-head"><div><span className="eyebrow">STUDIO ANALIZY</span><h2>Szachownica</h2></div><span className="live">● LIVE</span></div>
      <div className="board"><Chessboard position={game.fen()} onPieceDrop={onDrop} boardWidth={Math.min(520, typeof window!=="undefined"?window.innerWidth-48:520)} /></div>
      <div className="controls"><button className="ghost" onClick={()=>{const n=new Chess(game.fen());n.undo();setGame(n);}}>↶ Cofnij</button><button className="ghost" onClick={reset}>Nowa partia</button><button className="primary" onClick={analyze} disabled={!token}>Analizuj pozycję</button><button className="ghost" onClick={save} disabled={!token}>Zapisz partię</button></div>
      <p className="notice">{message}</p></div>
      <aside className="side">
        <div className="panel insight"><span className="eyebrow">{isAdmin?"CHESSMIND NATIVE ENGINE":"CHESSMIND PREDICT"}</span><h2>{isAdmin?"Analiza silnika":"Możliwe decyzje"}</h2><p className="muted">{isAdmin?"Najlepsze ruchy wyliczone przez własny silnik ChessMind.":"Rozkład przewidywanych ludzkich ruchów dla aktualnej pozycji."}</p>
          {nativeMoves.length?nativeMoves.map((p,i)=><div className="prediction" key={p.san}><b>{i+1}. {p.san}</b><strong>{p.score>0?"+":""}{p.score}</strong><small>{p.quality} • {p.from} → {p.to}</small></div>):null}
          {predictions.length?predictions.map((p,i)=><div className="prediction" key={p.san}><b>{i+1}. {p.san}</b><div className="bar"><span style={{width:`${p.probability*100}%`}}/></div><strong>{(p.probability*100).toFixed(1)}%</strong></div>):(!nativeMoves.length?<div className="empty">Wykonaj analizę, aby zobaczyć wyniki.</div>:null)}
          {evaluation&&<div className="eval"><span>Bilans materiału (białe)</span><b>{evaluation.material_balance_white>0?"+":""}{evaluation.material_balance_white}</b><small>{evaluation.note}</small></div>}
        </div>
        <div className="panel history"><span className="eyebrow">TWOJE ARCHIWUM</span><h2>Ostatnie partie</h2>{history.length?history.slice(0,5).map(g=><div className="game-row" key={g.id}><span>Partia #{g.id}</span><b>{g.result}</b></div>):<div className="empty">Zapisane partie pojawią się tutaj.</div>}</div>
      </aside>
    </section>
    <footer>CHESSMIND AI <span>Wersja 0.1 • Model predykcji eksperymentalny</span></footer>
  </main>;
}
