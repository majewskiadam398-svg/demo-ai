"use client";
import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TRAINING_API = process.env.NEXT_PUBLIC_TRAINING_API_URL || API;
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
  const [activeTab,setActiveTab] = useState<"pulpit"|"partia"|"analiza"|"historia"|"konto">("pulpit");
  const [training,setTraining] = useState(false);
  const [difficulty,setDifficulty] = useState("easy");
  const [trainingModel,setTrainingModel] = useState("balanced");
  const [trainingBusy,setTrainingBusy] = useState(false);
  const [coachText,setCoachText] = useState("Włącz trening, aby zagrać białymi przeciwko ChessMind AI.");
  const [hint,setHint] = useState<any>(null);

  async function request(path:string, body?:any) {
    const res = await fetch(API+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.detail || "Wystąpił błąd");
    return data;
  }
  async function trainingRequest(path:string, body:any) {
    const res = await fetch(TRAINING_API+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.detail || "Błąd silnika treningowego");
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
  useEffect(()=>{
    if(!training || !token || game.turn() !== "b" || game.isGameOver()) return;
    let cancelled = false;
    setTrainingBusy(true);
    trainingRequest("/ai/training-move",{fen:game.fen(),difficulty,model:trainingModel,training_games:history.slice(0,30).map((g:any)=>g.pgn)})
      .then((data)=>{
        if(cancelled || !data.uci) return;
        const next = new Chess(game.fen());
        next.move({from:data.uci.slice(0,2),to:data.uci.slice(2,4),promotion:data.uci[4] || "q"});
        setGame(next); setCoachText(data.explanation + " Model: " + data.model + "."); setHint(null);
      })
      .catch((e:any)=>{if(!cancelled)setCoachText("Nie udało się wykonać ruchu AI: "+e.message);})
      .finally(()=>{if(!cancelled)setTrainingBusy(false);});
    return ()=>{cancelled=true;};
  },[game,training,token,difficulty,trainingModel,history]);
  async function askHint(){
    try { const data=await trainingRequest("/ai/hint",{fen:game.fen(),training_games:history.slice(0,30).map((g:any)=>g.pgn)}); setHint(data); setCoachText(data.explanation); }
    catch(e:any) { setCoachText("Nie udało się pobrać podpowiedzi: "+e.message); }
  }
  function onDrop(source:string,target:string) {
    if(training && game.turn() !== "w") return false;
    const next = new Chess(game.fen());
    try { next.move({from:source,to:target,promotion:"q"}); setGame(next); setPredictions([]); setNativeMoves([]); setEvaluation(null); return true; }
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
    {token && <nav className="main-tabs" aria-label="Nawigacja ChessMind">{([["pulpit","Pulpit"],["partia","Partia"],["analiza","Analiza"],["historia","Historia"],["konto","Konto"]] as const).map(([id,label])=><button key={id} className={activeTab===id?"selected":""} onClick={()=>setActiveTab(id)}>{label}{id==="historia"&&history.length>0?<span className="tab-count">{history.length}</span>:null}</button>)}</nav>}
    {token && activeTab==="pulpit" && <section className="welcome-strip"><div><span className="eyebrow">WITAJ W CHESSMIND</span><h2>Każdy ruch to nowa możliwość.</h2><p>Rozegraj partię, sprawdź pomysły i wróć do swoich postępów.</p></div><div className="welcome-stat"><b>{history.length}</b><span>ZAPISANE PARTIE</span></div><button className="primary" onClick={()=>{reset();setActiveTab("partia");}}>＋ Nowa partia</button></section>}
    {token && ["pulpit","partia","analiza"].includes(activeTab) && <section className="workspace">
      <div className="board-panel panel"><div className="section-head"><div><span className="eyebrow">{activeTab==="analiza"?"CENTRUM ANALIZY":"STUDIO GRY"}</span><h2>{activeTab==="analiza"?"Pozycja pod lupą":"Szachownica"}</h2></div><span className="live">● {game.isGameOver()?"KONIEC":game.isCheck()?"SZACH":"NA ŻYWO"}</span></div>
      <div className="board"><Chessboard position={game.fen()} onPieceDrop={onDrop} customArrows={activeTab==="analiza"?[...nativeMoves.map((p:any)=>[p.from,p.to] as [string,string]),...predictions.map((p:any)=>[p.from,p.to] as [string,string]),...(hint?.uci?[[hint.uci.slice(0,2),hint.uci.slice(2,4)] as [string,string][]]:[])]:[]} boardWidth={Math.min(520, typeof window!=="undefined"?window.innerWidth-48:520)} /></div>
      <div className="controls"><button className="ghost" onClick={()=>{const n=new Chess(game.fen());n.undo();setGame(n);}}>↶ Cofnij</button><button className="ghost" onClick={reset}>Nowa partia</button><button className="primary" onClick={analyze} disabled={!token}>Analizuj pozycję</button><button className="ghost" onClick={save} disabled={!token}>Zapisz partię</button></div>
      <div className="game-meta"><span>RUCH <b>{game.moveNumber()}</b></span><span>KOLEJ <b>{game.turn()==="w"?"BIAŁYCH":"CZARNYCH"}</b></span><span>STATUS <b>{game.isCheckmate()?"MAT":game.isCheck()?"SZACH":game.isDraw()?"REMIS":"W GRZE"}</b></span></div><p className="notice">{message}</p></div>
      <aside className="side">
        {activeTab==="partia" && <div className="panel insight training-panel"><span className="eyebrow">NAUKA Z TRENEREM AI</span><h2>Tryb treningowy</h2><p className="muted">Ty grasz białymi, ChessMind AI czarnymi. Trener wyjaśnia ruchy po polsku.</p>
          <button className={training?"ghost":"primary"} disabled={!token} onClick={()=>{const enabled=!training;setTraining(enabled);setGame(new Chess());setHint(null);setCoachText(enabled?"Zaczynamy! Zagraj pierwszy ruch białymi.":"Trening wyłączony.");}}>{training?"Zakończ trening":"Rozpocznij trening"}</button>
          <label>Poziom trudności</label><select value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option><option value="impossible">Impossible</option></select>
          <label>Styl gry AI</label><select value={trainingModel} onChange={e=>setTrainingModel(e.target.value)}><option value="balanced">Zrównoważony</option><option value="aggressive">Taktyczny — atak</option><option value="solid">Pozycyjny — bezpieczny</option><option value="adaptive">Dopasowany do moich partii</option></select>
          <button className="ghost" onClick={askHint} disabled={!token||game.isGameOver()||game.turn()!=="w"}>Podpowiedz mi ruch</button>
          <div className="empty">{trainingBusy?"AI myśli…":coachText}</div>{hint&&<div className="prediction"><b>Podpowiedź: {hint.san}</b><small>{hint.explanation}</small></div>}
          <p className="hint">Poziomy są orientacyjne. Model dopasowany korzysta z zapisanych partii i wzorców ruchów.</p>
        </div>}
        <div className="panel insight" style={{display:activeTab==="partia"?"none":"block"}}><span className="eyebrow">{isAdmin?"CHESSMIND NATIVE ENGINE":"CHESSMIND PREDICT"}</span><h2>{isAdmin?"Analiza silnika":"Możliwe decyzje"}</h2><p className="muted">{isAdmin?"Najlepsze ruchy wyliczone przez własny silnik ChessMind.":"Rozkład przewidywanych ludzkich ruchów dla aktualnej pozycji."}</p>
          {nativeMoves.length?nativeMoves.map((p,i)=><div className="prediction" key={p.san}><b>{i+1}. {p.san}</b><strong>{p.score>0?"+":""}{p.score}</strong><small>{p.quality} • {p.from} → {p.to}</small></div>):null}
          {predictions.length?predictions.map((p,i)=><div className="prediction" key={p.san}><b>{i+1}. {p.san}</b><div className="bar"><span style={{width:`${p.probability*100}%`}}/></div><strong>{(p.probability*100).toFixed(1)}%</strong></div>):(!nativeMoves.length?<div className="empty">Wykonaj analizę, aby zobaczyć wyniki.</div>:null)}
          {evaluation&&<div className="eval"><span>Bilans materiału (białe)</span><b>{evaluation.material_balance_white>0?"+":""}{evaluation.material_balance_white}</b><small>{evaluation.note}</small></div>}
        </div>
        <div className="panel history" style={{display:activeTab==="partia"||activeTab==="analiza"?"none":"block"}}><span className="eyebrow">TWOJE ARCHIWUM</span><h2>Ostatnie partie</h2>{history.length?history.slice(0,5).map(g=><div className="game-row" key={g.id}><span>Partia #{g.id}</span><b>{g.result}</b></div>):<div className="empty">Zapisane partie pojawią się tutaj.</div>}</div>
      {activeTab==="partia" && <div className="panel move-list"><span className="eyebrow">ZAPIS RUCHÓW</span><h2>Przebieg partii</h2>{game.history({verbose:true}).length?game.history({verbose:true}).map((m:any,i:number)=><div className="game-row" key={`${m.from}-${m.to}-${i}`}><span>{Math.floor(i/2)+1}. {m.color==="w"?"♔":"♚"} {m.san}</span><b>{m.from} → {m.to}</b></div>):<div className="empty">Wykonaj pierwszy ruch, aby rozpocząć zapis.</div>}</div>}
      </aside>
    </section>}
    {token && activeTab==="historia" && <section className="panel archive-page"><span className="eyebrow">TWOJE ARCHIWUM</span><h2>Historia partii</h2><p className="muted">Wszystkie partie zapisane na Twoim koncie.</p>{history.length?history.map((g:any)=><div className="archive-row" key={g.id}><div><b>Partia #{g.id}</b><small>{g.created_at?new Date(g.created_at).toLocaleString("pl-PL"):"Zapisana partia"}</small></div><strong>{g.result}</strong></div>):<div className="empty">Nie masz jeszcze zapisanych partii. Zagraj i wybierz „Zapisz partię”.</div>}</section>}
    {token && activeTab==="konto" && <section className="profile-grid"><div className="panel profile-card"><span className="eyebrow">TWÓJ PROFIL</span><div className="profile-avatar">♞</div><h2>{username}</h2><p>{isAdmin?"Administrator ChessMind":"Zawodnik ChessMind"}</p><span className="role-pill">{isAdmin?"DOSTĘP ADMINISTRATORA":"KONTO GRACZA"}</span><button className="ghost" onClick={()=>{setToken("");setHistory([]);setActiveTab("pulpit");}}>Wyloguj się</button></div><div className="panel profile-card"><span className="eyebrow">TWOJE STATYSTYKI</span><div className="profile-stats"><div><b>{history.length}</b><span>ZAPISANE PARTIE</span></div><div><b>{game.history().length}</b><span>RUCHY W TEJ PARTII</span></div></div><h3>Mała wskazówka</h3><p className="muted">Po każdej partii zapisz ją w archiwum. Z czasem łatwiej zauważysz powtarzające się motywy i decyzje.</p></div></section>}
    <footer>CHESSMIND AI <span>Twoja przestrzeń do szachowego rozwoju</span></footer>
  </main>;
}
