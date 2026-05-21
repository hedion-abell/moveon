import { useState, useRef, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from "firebase/firestore";

// ── Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyC5SbZWFsHTi71_PBIvfPKK1j1X9qr8fLw",
  authDomain: "moveon-4ddfa.firebaseapp.com",
  projectId: "moveon-4ddfa",
  storageBucket: "moveon-4ddfa.firebasestorage.app",
  messagingSenderId: "468856039964",
  appId: "1:468856039964:web:6c107e352213d9265bcdd9"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ── Firestore helpers
async function fsGet(col, id) {
  const snap = await getDoc(doc(db, col, id));
  return snap.exists() ? snap.data() : null;
}
async function fsSet(col, id, data) {
  await setDoc(doc(db, col, id), data, { merge: true });
}
async function fsGetAll(col) {
  const snap = await getDocs(collection(db, col));
  const result = {};
  snap.forEach(d => { result[d.id] = d.data(); });
  return result;
}

const EMOTIONS = [
  { emoji: "😄", label: "신나요" }, { emoji: "😊", label: "기뻐요" },
  { emoji: "😐", label: "보통이에요" }, { emoji: "😴", label: "피곤해요" },
  { emoji: "😟", label: "힘들어요" }, { emoji: "😡", label: "짜증나요" },
];
const MEDALS = ["🥇","🥈","🥉","4️⃣","5️⃣"];
const P = "#7c5cd6", LP = "#f0e8ff", OR = "#f0a030", LO = "#fff8e8";
const CARD = { background:"#fff", borderRadius:16, padding:"14px 16px", marginBottom:12, border:"1.5px solid #f0e8d8" };
const today = new Date().toISOString().slice(0, 10);

const DEFAULT_DATA = {
  users: [
    {id:"u1",name:"김민준",grade:1,classNum:1,gender:"남",role:"student",pw:"1234"},
    {id:"u2",name:"이서연",grade:1,classNum:1,gender:"여",role:"student",pw:"1234"},
    {id:"u3",name:"박지호",grade:2,classNum:2,gender:"남",role:"student",pw:"1234"},
    {id:"u10",name:"김선생",grade:null,classNum:1,gender:null,role:"teacher",pw:"teacher1"},
    {id:"u11",name:"이선생",grade:null,classNum:2,gender:null,role:"teacher",pw:"teacher2"},
    {id:"u99",name:"관리자",grade:null,classNum:null,gender:null,role:"master",pw:"master"},
  ],
  exercises: [
    {id:"e1",name:"줄넘기",icon:"🪢",type:"quantity",unit:"회"},
    {id:"e2",name:"달리기",icon:"🏃",type:"quantity",unit:"분"},
    {id:"e3",name:"걷기",icon:"🚶",type:"quantity",unit:"분"},
    {id:"e4",name:"스트레칭",icon:"🤸",type:"check",unit:""},
  ],
  grades:[1,2], classes:[1,2],
};

function gk(uid, date) { return `${uid}_${date}`; }
function goalKey(uid, exId) { return `${uid}_${exId}`; }

function totalSoFar(records, uid, exId, ex) {
  return Object.entries(records)
    .filter(([k]) => k.startsWith(`${uid}_`))
    .reduce((s, [, r]) => {
      if (ex.type === "quantity") { const v = r.quantities?.[exId]; return s + (v !== undefined && v !== "" ? Number(v) : 0); }
      return s + (r.checks?.[exId] ? 1 : 0);
    }, 0);
}

function trendFn(records, uid, exId, ex) {
  const vals = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const r = records[gk(uid, d.toISOString().slice(0, 10))];
    if (!r) continue;
    if (ex.type === "quantity") { const v = r.quantities?.[exId]; if (v !== "" && v !== undefined) vals.push(Number(v)); }
    else { if (r.checks?.[exId] !== undefined) vals.push(r.checks[exId] ? 1 : 0); }
  }
  if (vals.length < 2) return "➡️";
  const h = Math.ceil(vals.length / 2);
  const a = vals.slice(0, h).reduce((x, y) => x + y, 0) / h;
  const b = vals.slice(Math.floor(vals.length / 2)).reduce((x, y) => x + y, 0) / (vals.length - Math.floor(vals.length / 2));
  return b > a * 1.1 ? "📈" : b < a * 0.9 ? "📉" : "➡️";
}

async function callAI(system, userMsg) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:120, system, messages:[{role:"user",content:userMsg}] })
    });
    const j = await r.json();
    return j.content?.[0]?.text?.trim() || "";
  } catch { return ""; }
}

function getRanking(users, records, filterFn, exId, ex) {
  return users.filter(u => u.role === "student" && filterFn(u))
    .map(s => ({ s, val: totalSoFar(records, s.id, exId, ex) }))
    .sort((a, b) => b.val - a.val).slice(0, 5);
}

export default function App() {
  const [data, setData] = useState({ ...DEFAULT_DATA, records:{}, goals:{}, messages:{} });
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("login");
  const [adminTab, setAdminTab] = useState("list");
  const [loginId, setLoginId] = useState(""); const [loginPw, setLoginPw] = useState(""); const [loginErr, setLoginErr] = useState("");
  const [checks, setChecks] = useState({}); const [quantities, setQuantities] = useState({});
  const [emotionBefore, setEmotionBefore] = useState(null); const [emotionAfter, setEmotionAfter] = useState(null);
  const [aiCheer, setAiCheer] = useState({}); const [aiLoading, setAiLoading] = useState(false);
  const [inputCheer, setInputCheer] = useState({});
  const inputTimers = useRef({});
  const [editGoals, setEditGoals] = useState({});
  const [calMonth, setCalMonth] = useState(today.slice(0,7));
  const [calStudent, setCalStudent] = useState(null);
  const [matrixEx, setMatrixEx] = useState(null); const [matrixMonth, setMatrixMonth] = useState(today.slice(0,7));
  const [newExName, setNewExName] = useState(""); const [newExIcon, setNewExIcon] = useState("⭐");
  const [newExType, setNewExType] = useState("check"); const [newExUnit, setNewExUnit] = useState("");
  const [newStudent, setNewStudent] = useState({name:"",grade:"1",classNum:"1",gender:"남",pw:"1234"});
  const [newGrade, setNewGrade] = useState(""); const [newClass, setNewClass] = useState("");
  const [msgTarget, setMsgTarget] = useState(""); const [msgText, setMsgText] = useState("");
  const [goalTarget, setGoalTarget] = useState(""); const [goalEx, setGoalEx] = useState(""); const [goalVal, setGoalVal] = useState("");
  const [goalPopup, setGoalPopup] = useState(false);

  // ── Firebase에서 초기 데이터 로드
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [users, exercises, records, goals, messages, meta] = await Promise.all([
          fsGetAll("users"), fsGetAll("exercises"), fsGetAll("records"),
          fsGetAll("goals"), fsGetAll("messages"), fsGet("meta","config")
        ]);
        const userList = Object.keys(users).length > 0 ? Object.values(users) : DEFAULT_DATA.users;
        const exList = Object.keys(exercises).length > 0 ? Object.values(exercises) : DEFAULT_DATA.exercises;
        // 첫 실행 시 기본 데이터 저장
        if (Object.keys(users).length === 0) {
          for (const u of DEFAULT_DATA.users) await fsSet("users", u.id, u);
          for (const e of DEFAULT_DATA.exercises) await fsSet("exercises", e.id, e);
          await fsSet("meta","config",{ grades:DEFAULT_DATA.grades, classes:DEFAULT_DATA.classes });
        }
        setData({
          users: userList,
          exercises: exList,
          grades: meta?.grades || DEFAULT_DATA.grades,
          classes: meta?.classes || DEFAULT_DATA.classes,
          records, goals, messages,
        });
      } catch(e) { console.error(e); }
      setLoading(false);
    }
    loadData();
  }, []);

  async function saveRecord() {
    const key = gk(user.id, today);
    const rec = { checks, quantities, emotionBefore, emotionAfter, date: today };
    setData(d => ({...d, records:{...d.records,[key]:rec}}));
    await fsSet("records", key, rec);
    setPage("done"); setAiLoading(true);
    const newCheer = {};
    for (const ex of data.exercises.filter(e => e.type === "quantity")) {
      const goal = data.goals[goalKey(user.id, ex.id)];
      if (!goal) continue;
      const tot = totalSoFar(data.records, user.id, ex.id, ex) + Number(quantities[ex.id]||0);
      const rem = Math.max(0, goal.target - tot);
      const msg = await callAI("초등학교 1~2학년 학생을 응원하는 따뜻한 선생님. 한 문장, 이모지 1~2개, 귀엽게.",
        `${ex.name} 목표 ${goal.target}${ex.unit} 중 ${tot}${ex.unit} 했고 ${rem}${ex.unit} 남았어요.`);
      newCheer[ex.id] = msg || "조금만 더! 💪";
    }
    setAiCheer(newCheer); setAiLoading(false);
  }

  async function handleQuantityChange(exId, val, ex) {
    setQuantities(q => ({...q,[exId]:val}));
    if (!val || Number(val) <= 0) { setInputCheer(c => ({...c,[exId]:""})); return; }
    if (inputTimers.current[exId]) clearTimeout(inputTimers.current[exId]);
    inputTimers.current[exId] = setTimeout(async () => {
      const msg = await callAI("초등학교 1~2학년 응원 선생님. 한 문장, 이모지 1개.", `오늘 ${ex.name} ${val}${ex.unit} 했어요. 응원해줘.`);
      setInputCheer(c => ({...c,[exId]:msg||`${val}${ex.unit} 대단해요! 🎉`}));
    }, 900);
  }

  async function saveMyGoals() {
    const updated = {...data.goals};
    for (const [k,v] of Object.entries(editGoals)) {
      if (v) { updated[k] = {...updated[k], target:Number(v)}; await fsSet("goals", k, updated[k]); }
    }
    setData(d => ({...d, goals:updated})); setPage("home");
  }

  async function addStudent() {
    if (!newStudent.name.trim()) return;
    const id = `u${Date.now()}`;
    const s = {...newStudent, id, grade:parseInt(newStudent.grade), classNum:parseInt(newStudent.classNum), role:"student"};
    setData(d => ({...d, users:[...d.users, s]}));
    await fsSet("users", id, s);
    setNewStudent({name:"",grade:"1",classNum:"1",gender:"남",pw:"1234"});
  }

  async function removeStudent(id) {
    setData(d => ({...d, users:d.users.filter(u=>u.id!==id)}));
    await deleteDoc(doc(db,"users",id));
  }

  async function addExercise() {
    if (!newExName.trim()) return;
    const id = `e${Date.now()}`;
    const ex = {id, name:newExName.trim(), icon:newExIcon, type:newExType, unit:newExUnit};
    setData(d => ({...d, exercises:[...d.exercises, ex]}));
    await fsSet("exercises", id, ex);
    setNewExName(""); setNewExIcon("⭐"); setNewExUnit("");
  }

  async function removeExercise(id) {
    setData(d => ({...d, exercises:d.exercises.filter(e=>e.id!==id)}));
    await deleteDoc(doc(db,"exercises",id));
  }

  async function sendMessage() {
    if (!msgTarget || !msgText.trim()) return;
    const msg = {text:msgText.trim(), from:user.name, date:today};
    setData(d => ({...d, messages:{...d.messages,[msgTarget]:msg}}));
    await fsSet("messages", msgTarget, msg);
    setMsgText(""); setMsgTarget("");
  }

  async function setGoalFn() {
    if (!goalTarget||!goalEx||!goalVal) return;
    const ex = data.exercises.find(e=>e.id===goalEx);
    const k = goalKey(goalTarget, goalEx);
    const g = {target:Number(goalVal), unit:ex.unit, exName:ex.name};
    setData(d => ({...d, goals:{...d.goals,[k]:g}}));
    await fsSet("goals", k, g);
    setGoalVal(""); setGoalPopup(true); setTimeout(()=>setGoalPopup(false),2000);
  }

  async function updateMeta(key, value) {
    const updated = {...data, [key]:value};
    setData(d => ({...d,[key]:value}));
    await fsSet("meta","config",{ grades: updated.grades, classes: updated.classes });
  }

  function login() {
    const u = data.users.find(x => x.name===loginId && x.pw===loginPw);
    if (!u) { setLoginErr("아이디나 비밀번호가 틀렸어요!"); return; }
    setUser(u); setLoginErr("");
    if (u.role==="student") {
      const rec = data.records[gk(u.id,today)];
      if (rec) { setChecks(rec.checks||{}); setQuantities(rec.quantities||{}); setEmotionBefore(rec.emotionBefore||null); setEmotionAfter(rec.emotionAfter||null); setPage("done"); }
      else { setChecks({}); setQuantities({}); setEmotionBefore(null); setEmotionAfter(null); setPage("home"); }
    } else { setPage("admin"); setAdminTab("list"); }
  }

  function logout() { setUser(null); setPage("login"); setLoginId(""); setLoginPw(""); setLoginErr(""); setAiCheer({}); setInputCheer({}); }
  function goHome() { setPage("home"); }

  const myStudents = user?.role==="master" ? data.users.filter(u=>u.role==="student")
    : data.users.filter(u=>u.role==="student"&&u.classNum===user?.classNum);

  function getRecord(uid,date){return data.records[gk(uid,date)];}
  function daysInMonth(ym){const[y,m]=ym.split("-").map(Number);return Array.from({length:new Date(y,m,0).getDate()},(_,i)=>String(i+1).padStart(2,"0"));}
  function calDays(ym){const[y,m]=ym.split("-").map(Number);return{first:new Date(y,m-1,1).getDay(),last:new Date(y,m,0).getDate()};}
  function prevNextMonth(ym,delta){const[y,m]=ym.split("-").map(Number);const nd=new Date(y,m-1+delta,1);return`${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,"0")}`;}
  const checkDone=data.exercises.every(ex=>ex.type==="check"?checks[ex.id]!==undefined:(quantities[ex.id]!==undefined&&quantities[ex.id]!==""));

  function TopBar({title}){
    return(
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <button onClick={goHome} style={{fontSize:22,background:"none",border:"none",cursor:"pointer",padding:0}}>🏠</button>
        <span style={{fontSize:14,fontWeight:700,color:P}}>{title}</span>
        <button onClick={logout} style={{fontSize:12,color:"#aaa",background:"none",border:"1px solid #ddd",borderRadius:8,padding:"4px 10px",cursor:"pointer"}}>로그아웃</button>
      </div>
    );
  }

  function RankingBlock({filterFn,title}){
    const[rG,setRG]=useState("all");const[rC,setRC]=useState("all");
    const isMaster=user?.role==="master";
    const eff=u=>{if(!filterFn(u))return false;if(isMaster){if(rG!=="all"&&u.grade!==Number(rG))return false;if(rC!=="all"&&u.classNum!==Number(rC))return false;}return true;};
    return(
      <div style={CARD}>
        <div style={{fontSize:14,fontWeight:700,color:P,marginBottom:10}}>🏆 {title}</div>
        {isMaster&&(<div style={{display:"flex",gap:8,marginBottom:12}}>
          <select value={rG} onChange={e=>setRG(e.target.value)} style={{flex:1,padding:"6px 10px",borderRadius:10,border:"1.5px solid #e0d8f8",fontSize:13}}>
            <option value="all">전체 학년</option>{data.grades.map(g=><option key={g} value={g}>{g}학년</option>)}
          </select>
          <select value={rC} onChange={e=>setRC(e.target.value)} style={{flex:1,padding:"6px 10px",borderRadius:10,border:"1.5px solid #e0d8f8",fontSize:13}}>
            <option value="all">전체 반</option>{data.classes.map(c=><option key={c} value={c}>{c}반</option>)}
          </select>
        </div>)}
        {data.exercises.filter(e=>e.type==="quantity").map(ex=>{
          const ranking=getRanking(data.users,data.records,eff,ex.id,ex);
          return(<div key={ex.id} style={{marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:700,color:"#555",marginBottom:6}}>{ex.icon} {ex.name} 순위</div>
            {ranking.filter(r=>r.val>0).length===0?<div style={{fontSize:12,color:"#ccc",paddingLeft:8}}>기록 없음</div>
              :ranking.filter(r=>r.val>0).map(({s,val},i)=>(
                <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:10,background:i===0?"#fffbe6":i===1?"#f8f8f8":i===2?"#fff4ee":"#fafafa",marginBottom:4}}>
                  <span style={{fontSize:16,width:22,textAlign:"center"}}>{MEDALS[i]}</span>
                  <span style={{flex:1,fontSize:13,fontWeight:600}}>{s.name}</span>
                  <span style={{fontSize:11,color:"#aaa"}}>{s.grade}학년 {s.classNum}반</span>
                  <span style={{fontSize:13,fontWeight:700,color:P}}>{val}{ex.unit}</span>
                </div>
              ))}
          </div>);
        })}
      </div>
    );
  }

  if (loading) return(
    <div style={{minHeight:520,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#fff9f0,#f0f0ff)"}}>
      <div style={{fontSize:48,marginBottom:16}}>🏃‍♂️</div>
      <div style={{fontSize:16,color:P,fontWeight:700}}>데이터 불러오는 중...</div>
    </div>
  );

  if (page==="login") return(
    <div style={{minHeight:520,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#fff9f0,#f0f0ff)",padding:32}}>
      <div style={{fontSize:64,marginBottom:6}}>🏃‍♂️</div>
      <h1 style={{fontSize:28,fontWeight:900,marginBottom:6,letterSpacing:3,fontFamily:"Arial Black,Arial,sans-serif"}}>
        <span style={{color:"#f4a62a"}}>M</span><span style={{color:"#4db8e8"}}>O</span><span style={{color:"#e85d8a"}}>V</span>
        <span style={{color:"#5aaa2a"}}>E</span><span style={{color:"#ccc"}}>-</span><span style={{color:"#8bc34a"}}>O</span><span style={{color:"#f4a62a"}}>N</span>
      </h1>
      <p style={{color:"#a08060",marginBottom:24,fontSize:13}}>운동하고 건강해져요! 💪</p>
      <div style={{...CARD,width:"100%",maxWidth:320}}>
        <div style={{marginBottom:10}}>
          <label style={{fontSize:12,color:"#888",display:"block",marginBottom:3}}>이름</label>
          <input value={loginId} onChange={e=>setLoginId(e.target.value)} placeholder="이름 입력"
            style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #e0d8f8",fontSize:14,boxSizing:"border-box"}}
            onKeyDown={e=>e.key==="Enter"&&login()}/>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,color:"#888",display:"block",marginBottom:3}}>비밀번호</label>
          <input type="password" value={loginPw} onChange={e=>setLoginPw(e.target.value)} placeholder="비밀번호 입력"
            style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #e0d8f8",fontSize:14,boxSizing:"border-box"}}
            onKeyDown={e=>e.key==="Enter"&&login()}/>
        </div>
        {loginErr&&<p style={{color:"#e05555",fontSize:12,marginBottom:8}}>{loginErr}</p>}
        <button onClick={login} style={{width:"100%",padding:11,borderRadius:12,background:P,color:"#fff",fontSize:15,fontWeight:700,border:"none",cursor:"pointer"}}>로그인 🚀</button>
        <div style={{marginTop:12,padding:10,background:LP,borderRadius:10,fontSize:11,color:"#888"}}>
          <b style={{color:P}}>테스트 계정</b><br/>학생: 김민준 / 1234<br/>교사: 김선생 / teacher1<br/>관리자: 관리자 / master
        </div>
      </div>
    </div>
  );

  if (page==="home"&&user?.role==="student"){
    const myMsg=data.messages[user.id];
    const todayRec=data.records[gk(user.id,today)];
    const myGoalList=data.exercises.filter(ex=>ex.type==="quantity"&&data.goals[goalKey(user.id,ex.id)]);
    return(
      <div style={{minHeight:520,background:"linear-gradient(135deg,#fff9f0,#f0f0ff)",padding:"20px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <span style={{fontSize:16,fontWeight:700,color:P}}>👋 {user.name}</span>
          <button onClick={logout} style={{fontSize:12,color:"#aaa",background:"none",border:"1px solid #ddd",borderRadius:8,padding:"4px 10px",cursor:"pointer"}}>로그아웃</button>
        </div>
        {myMsg&&(<div style={{background:"linear-gradient(90deg,#f0e8ff,#fff8f0)",border:"1.5px solid #e0d0ff",borderRadius:14,padding:"10px 14px",marginBottom:12,display:"flex",gap:8}}>
          <span style={{fontSize:20}}>💌</span>
          <div><div style={{fontSize:11,color:"#b090e0",fontWeight:600,marginBottom:2}}>{myMsg.from} 선생님 · {myMsg.date}</div>
          <div style={{fontSize:13,color:"#444",lineHeight:1.6}}>{myMsg.text}</div></div>
        </div>)}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          {[
            {icon:"🏅",label:"오늘 운동 입력",color:P,bg:LP,action:()=>setPage("check")},
            {icon:"🎯",label:"나의 목표",color:OR,bg:LO,action:()=>{const init={};data.exercises.filter(e=>e.type==="quantity").forEach(ex=>{const v=data.goals[goalKey(user.id,ex.id)];init[goalKey(user.id,ex.id)]=v?.target||"";});setEditGoals(init);setPage("mygoal");}},
            {icon:"📅",label:"나의 기록",color:"#2ab0a0",bg:"#e0faf6",action:()=>{setCalMonth(today.slice(0,7));setPage("mycalendar");}},
            {icon:todayRec?"✅":"⏳",label:todayRec?"오늘 완료!":"아직 미입력",color:todayRec?"#4caf50":"#aaa",bg:todayRec?"#e8f8e8":"#f5f5f5",action:()=>{if(todayRec)setPage("done");}},
          ].map(({icon,label,color,bg,action})=>(
            <button key={label} onClick={action} style={{padding:"20px 10px",borderRadius:16,border:"none",cursor:"pointer",background:bg,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
              <span style={{fontSize:30}}>{icon}</span>
              <span style={{fontSize:13,fontWeight:700,color}}>{label}</span>
            </button>
          ))}
        </div>
        {myGoalList.length>0&&(<div style={CARD}>
          <div style={{fontSize:13,fontWeight:700,color:P,marginBottom:10}}>🎯 나의 목표 현황</div>
          {myGoalList.map(ex=>{
            const goal=data.goals[goalKey(user.id,ex.id)];
            const tot=totalSoFar(data.records,user.id,ex.id,ex);
            const pct=Math.min(100,(tot/goal.target)*100);
            return(<div key={ex.id} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                <span>{ex.icon} {ex.name}</span><span style={{color:P,fontWeight:700}}>{tot} / {goal.target}{ex.unit}</span>
              </div>
              <div style={{height:8,background:"#f0e8ff",borderRadius:4,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${pct.toFixed(1)}%`,background:pct>=100?"#4caf50":P,borderRadius:4}}/>
              </div>
            </div>);
          })}
        </div>)}
        <RankingBlock filterFn={u=>u.grade===user.grade} title={`${user.grade}학년 운동 순위 🏆`}/>
      </div>
    );
  }

  if (page==="mygoal"&&user?.role==="student") return(
    <div style={{minHeight:520,background:"linear-gradient(135deg,#fff9f0,#f0f0ff)",padding:"20px 16px"}}>
      <TopBar title="🎯 나의 목표"/>
      <div style={CARD}>
        {data.exercises.filter(e=>e.type==="quantity").map(ex=>{
          const k=goalKey(user.id,ex.id); const tot=totalSoFar(data.records,user.id,ex.id,ex);
          return(<div key={ex.id} style={{marginBottom:14,padding:"10px 12px",background:"#fdf8ff",borderRadius:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{fontSize:20}}>{ex.icon}</span><span style={{fontWeight:700,fontSize:14}}>{ex.name}</span>
              <span style={{fontSize:12,color:"#aaa"}}>지금까지 {tot}{ex.unit}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13,color:"#888"}}>목표:</span>
              <input type="number" min="1" value={editGoals[k]||""} onChange={e=>setEditGoals(g=>({...g,[k]:e.target.value}))} placeholder="숫자 입력"
                style={{width:80,padding:"7px 10px",borderRadius:10,border:`1.5px solid ${editGoals[k]?P:"#ddd"}`,fontSize:14,textAlign:"center",fontWeight:700}}/>
              <span style={{fontSize:13,color:"#888"}}>{ex.unit}</span>
            </div>
          </div>);
        })}
        <button onClick={saveMyGoals} style={{width:"100%",padding:12,borderRadius:12,background:P,color:"#fff",fontWeight:700,border:"none",cursor:"pointer",fontSize:15}}>저장하기 💾</button>
      </div>
    </div>
  );

  if (page==="mycalendar"&&user?.role==="student"){
    const{first,last}=calDays(calMonth);
    const days=[];for(let i=0;i<first;i++)days.push(null);for(let d=1;d<=last;d++)days.push(d);
    const monthRecs=Object.entries(data.records).filter(([k])=>k.startsWith(`${user.id}_${calMonth}`)).map(([,v])=>v).sort((a,b)=>b.date.localeCompare(a.date));
    return(
      <div style={{minHeight:520,background:"linear-gradient(135deg,#fff9f0,#f0f0ff)",padding:"20px 16px"}}>
        <TopBar title="📅 나의 기록"/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <button onClick={()=>setCalMonth(prevNextMonth(calMonth,-1))} style={{background:"none",border:"none",fontSize:18,cursor:"pointer"}}>◀</button>
          <span style={{fontWeight:700,color:P}}>{calMonth}</span>
          <button onClick={()=>setCalMonth(prevNextMonth(calMonth,1))} style={{background:"none",border:"none",fontSize:18,cursor:"pointer"}}>▶</button>
        </div>
        <div style={CARD}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,textAlign:"center",marginBottom:10}}>
            {["일","월","화","수","목","금","토"].map(d=><div key={d} style={{fontSize:10,color:"#aaa"}}>{d}</div>)}
            {days.map((d,i)=>{if(!d)return<div key={`e${i}`}/>;const ds=`${calMonth}-${String(d).padStart(2,"0")}`,rec=getRecord(user.id,ds),isT=ds===today;
              return<div key={d} style={{borderRadius:8,padding:"5px 2px",background:rec?LP:isT?LO:"#f8f8f8",border:isT?`2px solid ${OR}`:"1px solid #eee"}}>
                <div style={{fontSize:11,fontWeight:isT?700:400,color:isT?OR:"#444"}}>{d}</div>
                {rec&&<div style={{fontSize:12}}>{rec.emotionAfter||"📝"}</div>}
              </div>;})}
          </div>
          {monthRecs.length===0?<p style={{color:"#ccc",fontSize:13,textAlign:"center",padding:"12px 0"}}>이 달 기록이 없어요</p>
            :monthRecs.map(rec=>(<div key={rec.date} style={{borderTop:"1px solid #f0e8d8",paddingTop:8,marginTop:8}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:12,color:"#aaa"}}>{rec.date}</span>
                <span style={{fontSize:13}}>{rec.emotionBefore} → {rec.emotionAfter}</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {data.exercises.map(ex=>{const val=ex.type==="check"?rec.checks?.[ex.id]:rec.quantities?.[ex.id];if(val===undefined)return null;
                  return<span key={ex.id} style={{fontSize:11,background:"#f5f0ff",borderRadius:8,padding:"3px 8px",color:P}}>{ex.icon} {ex.name}: {ex.type==="check"?(val?"✅":"❌"):`${val}${ex.unit}`}</span>;})}
              </div>
            </div>))}
        </div>
      </div>
    );
  }

  if (page==="check"&&user?.role==="student") return(
    <div style={{minHeight:520,background:"linear-gradient(135deg,#fff9f0,#f0f0ff)",padding:"20px 16px"}}>
      <TopBar title="🏅 오늘 운동 체크"/>
      {data.exercises.map(ex=>(
        <div key={ex.id} style={CARD}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:22}}>{ex.icon}</span>
            <span style={{flex:1,fontSize:15,fontWeight:600}}>{ex.name}</span>
            {ex.type==="check"?(
              <div style={{display:"flex",gap:8}}>
                {[true,false].map(v=>(<button key={String(v)} onClick={()=>setChecks(c=>({...c,[ex.id]:v}))}
                  style={{padding:"8px 12px",borderRadius:10,border:checks[ex.id]===v?`2px solid ${v?"#4caf50":"#f44336"}`:"1.5px solid #ddd",background:checks[ex.id]===v?(v?"#e8f8e8":"#ffeaea"):"#fff",fontSize:18,cursor:"pointer"}}>
                  {v?"✅":"❌"}</button>))}
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <input type="number" min="0" value={quantities[ex.id]??""} onChange={e=>handleQuantityChange(ex.id,e.target.value,ex)} placeholder="0"
                  style={{width:68,padding:"8px",borderRadius:10,border:`1.5px solid ${quantities[ex.id]?P:"#ddd"}`,fontSize:16,textAlign:"center",fontWeight:700}}/>
                <span style={{fontSize:12,color:"#888",background:"#f5f5f5",padding:"8px",borderRadius:10}}>{ex.unit}</span>
              </div>
            )}
          </div>
          {ex.type==="quantity"&&inputCheer[ex.id]&&(<div style={{marginTop:8,fontSize:12,color:P,background:LP,borderRadius:10,padding:"6px 10px"}}>{inputCheer[ex.id]}</div>)}
        </div>
      ))}
      {checkDone&&(<button onClick={()=>setPage("emotion")} style={{width:"100%",padding:13,borderRadius:14,background:P,color:"#fff",fontSize:16,fontWeight:700,border:"none",cursor:"pointer"}}>다음: 감정 기록 ➡️</button>)}
    </div>
  );

  if (page==="emotion"&&user?.role==="student") return(
    <div style={{minHeight:520,background:"linear-gradient(135deg,#fff9f0,#f0f0ff)",padding:"20px 16px"}}>
      <TopBar title="감정 기록 😊"/>
      {["before","after"].map(timing=>(
        <div key={timing} style={{marginBottom:16}}>
          <h2 style={{fontSize:15,fontWeight:700,color:"#444",marginBottom:10}}>{timing==="before"?"운동 전 기분은? 🤔":"운동 후 기분은? 😊"}</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {EMOTIONS.map(em=>{const sel=timing==="before"?emotionBefore:emotionAfter;const setSel=timing==="before"?setEmotionBefore:setEmotionAfter;
              return<button key={em.emoji} onClick={()=>setSel(em.emoji)} style={{padding:"11px 4px",borderRadius:14,border:sel===em.emoji?`2.5px solid ${timing==="before"?P:OR}`:"1.5px solid #e0d8f8",background:sel===em.emoji?(timing==="before"?LP:LO):"#fff",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <span style={{fontSize:26}}>{em.emoji}</span><span style={{fontSize:10,color:"#888"}}>{em.label}</span>
              </button>;})}
          </div>
        </div>
      ))}
      {emotionBefore&&emotionAfter&&(<button onClick={saveRecord} style={{width:"100%",padding:13,borderRadius:14,background:OR,color:"#fff",fontSize:16,fontWeight:700,border:"none",cursor:"pointer"}}>저장하기 💾</button>)}
    </div>
  );

  if (page==="done"&&user?.role==="student"){
    const rec=data.records[gk(user.id,today)]||{checks,quantities,emotionBefore,emotionAfter};
    const cC=rec.checks||checks,cQ=rec.quantities||quantities,cEB=rec.emotionBefore||emotionBefore,cEA=rec.emotionAfter||emotionAfter;
    return(
      <div style={{minHeight:520,background:"linear-gradient(135deg,#fff9f0,#f0f0ff)",padding:"20px 16px"}}>
        <TopBar title="오늘의 결과 🎉"/>
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:52,marginBottom:6}}>🎉</div>
          <h2 style={{fontSize:20,fontWeight:700,color:P,marginBottom:3}}>오늘도 잘했어요!</h2>
          <p style={{color:"#aaa",fontSize:13}}>오늘의 운동 기록이 저장됐어요</p>
        </div>
        <div style={CARD}>
          {data.exercises.map(ex=>{
            const goal=data.goals[goalKey(user.id,ex.id)];
            const tot=totalSoFar(data.records,user.id,ex.id,ex);
            const rem=goal?Math.max(0,goal.target-tot):null;
            const t=trendFn(data.records,user.id,ex.id,ex);
            return(<div key={ex.id} style={{marginBottom:12,paddingBottom:12,borderBottom:"1px solid #f5f0ff"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:18}}>{ex.icon}</span>
                <span style={{fontSize:13,fontWeight:700}}>{ex.name}</span>
                {ex.type==="check"?<span>{cC[ex.id]?"✅":"❌"}</span>:<span style={{color:P,fontWeight:700,fontSize:14}}>{cQ[ex.id]}<span style={{fontSize:11,color:"#aaa",marginLeft:2}}>{ex.unit}</span></span>}
                <span style={{fontSize:16}}>{t}</span>
              </div>
              {goal&&ex.type==="quantity"&&(<div style={{background:"#fdf8ff",borderRadius:10,padding:"8px 10px",borderLeft:`3px solid ${P}`,marginTop:6}}>
                <div style={{fontSize:11,color:P,fontWeight:700,marginBottom:2}}>🎯 목표: {goal.target}{ex.unit} · 현재 {tot}{ex.unit} · {rem}{ex.unit} 남음</div>
                <div style={{height:5,background:"#f0e8ff",borderRadius:3,overflow:"hidden",marginBottom:4}}>
                  <div style={{height:"100%",width:`${Math.min(100,(tot/goal.target)*100).toFixed(1)}%`,background:rem===0?"#4caf50":P,borderRadius:3}}/>
                </div>
                {aiLoading?<div style={{fontSize:11,color:"#bbb"}}>AI 응원 생성 중... ✨</div>:aiCheer[ex.id]&&<div style={{fontSize:11,color:P,lineHeight:1.5}}>{aiCheer[ex.id]}</div>}
              </div>)}
            </div>);
          })}
          <div style={{display:"flex",justifyContent:"center",gap:20,paddingTop:4}}>
            <div style={{textAlign:"center"}}><div style={{fontSize:10,color:"#aaa",marginBottom:2}}>운동 전</div><div style={{fontSize:28}}>{cEB}</div></div>
            <div style={{fontSize:20,lineHeight:"46px"}}>→</div>
            <div style={{textAlign:"center"}}><div style={{fontSize:10,color:"#aaa",marginBottom:2}}>운동 후</div><div style={{fontSize:28}}>{cEA}</div></div>
          </div>
        </div>
        <button onClick={()=>setPage("check")} style={{width:"100%",padding:11,borderRadius:12,background:LP,color:P,fontSize:13,fontWeight:700,border:"none",cursor:"pointer"}}>수정하기 ✏️</button>
      </div>
    );
  }

  if (page==="admin"){
    const roleName=user.role==="master"?"마스터":`${user.classNum}반 담임`;
    const tabs=user.role==="master"
      ?[["list","📋 현황"],["matrix","📊 명렬표"],["calendar","📅 달력"],["ranking","🏆 순위"],["manage","⚙️ 관리"]]
      :[["list","📋 현황"],["matrix","📊 명렬표"],["calendar","📅 달력"],["ranking","🏆 순위"],["msg","💌 메시지"]];
    return(
      <div style={{minHeight:520,background:"linear-gradient(135deg,#fff9f0,#f0f0ff)",padding:"20px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div><span style={{fontSize:16,fontWeight:700,color:P}}>{user.name}</span>
            <span style={{fontSize:11,background:LP,color:P,borderRadius:8,padding:"2px 8px",marginLeft:6}}>{roleName}</span></div>
          <button onClick={logout} style={{fontSize:12,color:"#aaa",background:"none",border:"1px solid #ddd",borderRadius:8,padding:"4px 10px",cursor:"pointer"}}>로그아웃</button>
        </div>
        <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
          {tabs.map(([t,label])=>(<button key={t} onClick={()=>setAdminTab(t)}
            style={{flex:1,minWidth:55,padding:"8px 2px",borderRadius:10,border:"none",fontWeight:700,fontSize:11,cursor:"pointer",background:adminTab===t?P:LP,color:adminTab===t?"#fff":P}}>{label}</button>))}
        </div>

        {adminTab==="list"&&(<div>
          <div style={{marginBottom:6,fontSize:12,color:"#aaa"}}>📅 {today} 기준</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead><tr style={{background:LP}}>
                <th style={{padding:"8px",textAlign:"left",color:P}}>이름</th>
                <th style={{padding:"8px 5px",color:P}}>학년/반</th>
                <th style={{padding:"8px 5px",color:P}}>성별</th>
                {data.exercises.map(ex=><th key={ex.id} style={{padding:"8px 5px",color:P,whiteSpace:"nowrap"}}>{ex.icon}{ex.unit?`(${ex.unit})`:""}</th>)}
                <th style={{padding:"8px 5px",color:P}}>전</th><th style={{padding:"8px 5px",color:P}}>후</th>
              </tr></thead>
              <tbody>{myStudents.map(s=>{const rec=getRecord(s.id,today);return(
                <tr key={s.id} style={{borderBottom:"1px solid #f0e8d8"}}>
                  <td style={{padding:"8px",fontWeight:600}}><span style={{cursor:"pointer",color:P,textDecoration:"underline"}} onClick={()=>{setCalStudent(s);setAdminTab("calendar");}}>{s.name}</span></td>
                  <td style={{padding:"8px 5px",textAlign:"center",color:"#888"}}>{s.grade}-{s.classNum}</td>
                  <td style={{padding:"8px 5px",textAlign:"center"}}>{s.gender==="남"?"👦":"👧"}</td>
                  {data.exercises.map(ex=><td key={ex.id} style={{padding:"8px 5px",textAlign:"center"}}>
                    {rec?(ex.type==="check"?(rec.checks?.[ex.id]?"✅":"❌"):<span style={{fontWeight:700,color:P}}>{rec.quantities?.[ex.id]??"-"}</span>):<span style={{color:"#ccc"}}>-</span>}
                  </td>)}
                  <td style={{padding:"8px 5px",textAlign:"center",fontSize:16}}>{rec?.emotionBefore||<span style={{color:"#ccc"}}>-</span>}</td>
                  <td style={{padding:"8px 5px",textAlign:"center",fontSize:16}}>{rec?.emotionAfter||<span style={{color:"#ccc"}}>-</span>}</td>
                </tr>);})}</tbody>
            </table>
          </div>
        </div>)}

        {adminTab==="matrix"&&(()=>{
          const selEx=matrixEx?data.exercises.find(e=>e.id===matrixEx):data.exercises[0];
          const days=daysInMonth(matrixMonth);
          const sel=myStudents.slice().sort((a,b)=>a.classNum-b.classNum||a.name.localeCompare(b.name,"ko"));
          return<div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <select value={selEx?.id??""} onChange={e=>setMatrixEx(e.target.value)} style={{flex:1,padding:"7px 10px",borderRadius:10,border:"1.5px solid #e0d8f8",fontSize:13}}>
                {data.exercises.map(ex=><option key={ex.id} value={ex.id}>{ex.icon} {ex.name}</option>)}
              </select>
              <input type="month" value={matrixMonth} onChange={e=>setMatrixMonth(e.target.value)} style={{padding:"7px 10px",borderRadius:10,border:"1.5px solid #e0d8f8",fontSize:13}}/>
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{borderCollapse:"collapse",fontSize:10,minWidth:500}}>
                <thead><tr style={{background:LP}}>
                  <th style={{padding:"7px 8px",textAlign:"left",color:P,position:"sticky",left:0,background:LP,zIndex:1}}>이름</th>
                  {days.map(d=><th key={d} style={{padding:"7px 3px",color:P,minWidth:24,textAlign:"center"}}>{parseInt(d)}</th>)}
                  <th style={{padding:"7px 5px",color:P}}>합계</th><th style={{padding:"7px 5px",color:P}}>추세</th>
                </tr></thead>
                <tbody>{sel.map((s,idx)=>{
                  let tot=0,cnt=0;
                  const cells=days.map(d=>{const rec=getRecord(s.id,`${matrixMonth}-${d}`);if(!rec)return null;
                    if(selEx?.type==="check"){const v=rec.checks?.[selEx.id];if(v!==undefined){tot+=v?1:0;cnt++;}return v!==undefined?(v?"✅":"❌"):null;}
                    else{const v=rec.quantities?.[selEx?.id];if(v!==undefined&&v!==""){tot+=Number(v);cnt++;}return v??null;}});
                  return<tr key={s.id} style={{background:idx%2===0?"#fff":"#fdf9ff",borderBottom:"1px solid #f0e8d8"}}>
                    <td style={{padding:"7px 8px",fontWeight:600,whiteSpace:"nowrap",position:"sticky",left:0,background:idx%2===0?"#fff":"#fdf9ff",zIndex:1}}>
                      {s.name}<span style={{color:"#ccc",fontWeight:400,fontSize:9}}> {s.grade}-{s.classNum}</span></td>
                    {cells.map((v,i)=><td key={i} style={{padding:"5px 3px",textAlign:"center",color:v!==null?P:"#e0e0e0",fontWeight:v!==null?600:400}}>{v!==null?v:"·"}</td>)}
                    <td style={{padding:"5px 6px",textAlign:"center",fontWeight:700,color:"#444"}}>{selEx?.type==="check"?`${tot}/${cnt}`:(cnt>0?tot:"-")}</td>
                    <td style={{padding:"5px 6px",textAlign:"center",fontSize:16}}>{selEx?trendFn(data.records,s.id,selEx.id,selEx):"-"}</td>
                  </tr>;})}
                </tbody>
              </table>
            </div>
          </div>;
        })()}

        {adminTab==="calendar"&&(<div>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <select value={calStudent?.id??""} onChange={e=>setCalStudent(myStudents.find(s=>s.id===e.target.value)||null)} style={{flex:1,padding:"7px 10px",borderRadius:10,border:"1.5px solid #e0d8f8",fontSize:13}}>
              <option value="">학생 선택</option>
              {myStudents.map(s=><option key={s.id} value={s.id}>{s.name} ({s.grade}-{s.classNum})</option>)}
            </select>
            <input type="month" value={calMonth} onChange={e=>setCalMonth(e.target.value)} style={{padding:"7px 10px",borderRadius:10,border:"1.5px solid #e0d8f8",fontSize:13}}/>
          </div>
          {calStudent&&(()=>{
            const{first,last}=calDays(calMonth);
            const days=[];for(let i=0;i<first;i++)days.push(null);for(let d=1;d<=last;d++)days.push(d);
            const recs=Object.entries(data.records).filter(([k])=>k.startsWith(`${calStudent.id}_${calMonth}`)).map(([,v])=>v).sort((a,b)=>b.date.localeCompare(a.date));
            return<div style={CARD}>
              <h3 style={{fontSize:13,fontWeight:700,color:P,marginBottom:8}}>{calStudent.name} · {calMonth}</h3>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,textAlign:"center",marginBottom:10}}>
                {["일","월","화","수","목","금","토"].map(d=><div key={d} style={{fontSize:9,color:"#aaa"}}>{d}</div>)}
                {days.map((d,i)=>{if(!d)return<div key={`e${i}`}/>;const ds=`${calMonth}-${String(d).padStart(2,"0")}`,rec=getRecord(calStudent.id,ds),isT=ds===today;
                  return<div key={d} style={{borderRadius:7,padding:"4px 2px",background:rec?LP:isT?LO:"#f8f8f8",border:isT?`2px solid ${OR}`:"1px solid #eee"}}>
                    <div style={{fontSize:10,fontWeight:isT?700:400,color:isT?OR:"#444"}}>{d}</div>
                    {rec&&<div style={{fontSize:11}}>{rec.emotionAfter||"📝"}</div>}
                  </div>;})}
              </div>
              {recs.length===0?<p style={{color:"#ccc",fontSize:12}}>기록 없음</p>:recs.map(rec=>(
                <div key={rec.date} style={{borderTop:"1px solid #f0e8d8",paddingTop:7,marginTop:7}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:11,color:"#aaa"}}>{rec.date}</span>
                    <span style={{fontSize:12}}>{rec.emotionBefore} → {rec.emotionAfter}</span>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {data.exercises.map(ex=>{const val=ex.type==="check"?rec.checks?.[ex.id]:rec.quantities?.[ex.id];if(val===undefined)return null;
                      return<span key={ex.id} style={{fontSize:10,background:"#f5f0ff",borderRadius:7,padding:"2px 7px",color:P}}>{ex.icon} {ex.name}: {ex.type==="check"?(val?"✅":"❌"):`${val}${ex.unit}`}</span>;})}
                  </div>
                </div>
              ))}
            </div>;
          })()}
        </div>)}

        {adminTab==="ranking"&&(<div>
          {user.role==="master"?<RankingBlock filterFn={()=>true} title="전체 학생 운동 순위"/>
            :<><RankingBlock filterFn={()=>true} title="전체 학년 운동 순위"/><RankingBlock filterFn={u=>u.classNum===user.classNum} title={`${user.classNum}반 운동 순위`}/></>}
        </div>)}

        {adminTab==="msg"&&user.role==="teacher"&&(<div>
          <div style={CARD}>
            <h3 style={{fontSize:13,fontWeight:700,color:P,marginBottom:10}}>💌 학생에게 메시지</h3>
            <select value={msgTarget} onChange={e=>setMsgTarget(e.target.value)} style={{width:"100%",padding:"8px 10px",borderRadius:10,border:"1.5px solid #e0d8f8",fontSize:13,marginBottom:8,boxSizing:"border-box"}}>
              <option value="">학생 선택</option>{myStudents.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <textarea value={msgText} onChange={e=>setMsgText(e.target.value)} placeholder="전하고 싶은 말 ✏️" rows={3}
              style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #e0d8f8",fontSize:13,resize:"none",boxSizing:"border-box",fontFamily:"inherit",marginBottom:8}}/>
            <button onClick={sendMessage} style={{width:"100%",padding:10,borderRadius:11,background:P,color:"#fff",fontWeight:700,border:"none",cursor:"pointer"}}>보내기 💌</button>
            {myStudents.filter(s=>data.messages[s.id]).map(s=>(
              <div key={s.id} style={{marginTop:8,background:"#fdf8ff",borderRadius:10,padding:"7px 10px",fontSize:11}}>
                <span style={{fontWeight:700,color:P}}>{s.name}</span>
                <span style={{color:"#aaa",marginLeft:6}}>{data.messages[s.id]?.date}</span>
                <div style={{color:"#555",marginTop:2}}>{data.messages[s.id]?.text}</div>
              </div>
            ))}
          </div>
          <div style={CARD}>
            <h3 style={{fontSize:13,fontWeight:700,color:P,marginBottom:10}}>🎯 목표 설정</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:7}}>
              <select value={goalTarget} onChange={e=>setGoalTarget(e.target.value)} style={{padding:"7px 8px",borderRadius:10,border:"1.5px solid #e0d8f8",fontSize:12}}>
                <option value="">학생 선택</option>{myStudents.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={goalEx} onChange={e=>setGoalEx(e.target.value)} style={{padding:"7px 8px",borderRadius:10,border:"1.5px solid #e0d8f8",fontSize:12}}>
                <option value="">운동 선택</option>{data.exercises.filter(e=>e.type==="quantity").map(ex=><option key={ex.id} value={ex.id}>{ex.icon}{ex.name}</option>)}
              </select>
            </div>
            <div style={{display:"flex",gap:7}}>
              <input type="number" min="1" value={goalVal} onChange={e=>setGoalVal(e.target.value)} placeholder="목표 수량" style={{flex:1,padding:"7px 10px",borderRadius:10,border:"1.5px solid #e0d8f8",fontSize:13}}/>
              <button onClick={setGoalFn} style={{padding:"7px 14px",borderRadius:10,background:OR,color:"#fff",border:"none",cursor:"pointer",fontWeight:700}}>설정</button>
            </div>
          </div>
        </div>)}

        {adminTab==="manage"&&user.role==="master"&&(<div>
          <div style={CARD}>
            <h3 style={{fontSize:13,fontWeight:700,color:P,marginBottom:10}}>🏫 학년 / 반 관리</h3>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["grades","학년","학년",newGrade,setNewGrade],["classes","반","반",newClass,setNewClass]].map(([key,label,suffix,val,setVal])=>(
                <div key={key}>
                  <div style={{fontSize:12,color:"#888",marginBottom:6,fontWeight:600}}>{label}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
                    {data[key].map(n=><div key={n} style={{display:"flex",alignItems:"center",gap:5,background:LP,borderRadius:16,padding:"4px 12px",fontSize:12}}>
                      <span style={{fontWeight:700}}>{n}{suffix}</span>
                      <button onClick={()=>updateMeta(key,data[key].filter(x=>x!==n))} style={{background:"none",border:"none",cursor:"pointer",color:"#e05555",fontSize:12,padding:0}}>✕</button>
                    </div>)}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <input type="number" min="1" value={val} onChange={e=>setVal(e.target.value)} placeholder={label} style={{flex:1,padding:"6px 8px",borderRadius:8,border:"1.5px solid #e0d8f8",fontSize:13}}/>
                    <button onClick={()=>{const n=parseInt(val);if(!n||data[key].includes(n))return;updateMeta(key,[...data[key],n].sort((a,b)=>a-b));setVal("");}}
                      style={{padding:"6px 12px",borderRadius:8,background:P,color:"#fff",border:"none",cursor:"pointer",fontWeight:700,fontSize:12}}>추가</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={CARD}>
            <h3 style={{fontSize:13,fontWeight:700,color:P,marginBottom:8}}>🏅 운동 종목</h3>
            {data.exercises.map(ex=>(<div key={ex.id} style={{display:"flex",alignItems:"center",gap:7,background:"#f8f4ff",borderRadius:10,padding:"7px 10px",marginBottom:5,fontSize:12}}>
              <span>{ex.icon}</span><span style={{flex:1,fontWeight:600}}>{ex.name}</span>
              <span style={{fontSize:10,color:"#aaa",background:"#fff",borderRadius:5,padding:"1px 6px"}}>{ex.type==="check"?"체크":`수량(${ex.unit})`}</span>
              <button onClick={()=>removeExercise(ex.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#e05555",fontSize:13,padding:0}}>✕</button>
            </div>))}
            <div style={{display:"grid",gridTemplateColumns:"44px 1fr",gap:5,marginBottom:5}}>
              <input value={newExIcon} onChange={e=>setNewExIcon(e.target.value)} style={{padding:"6px 2px",borderRadius:8,border:"1.5px solid #e0d8f8",fontSize:16,textAlign:"center"}}/>
              <input value={newExName} onChange={e=>setNewExName(e.target.value)} placeholder="운동 이름" style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid #e0d8f8",fontSize:13}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 64px",gap:5}}>
              <select value={newExType} onChange={e=>setNewExType(e.target.value)} style={{padding:"6px 8px",borderRadius:8,border:"1.5px solid #e0d8f8",fontSize:12}}>
                <option value="check">체크 ✅</option><option value="quantity">수량 입력</option>
              </select>
              {newExType==="quantity"?<input value={newExUnit} onChange={e=>setNewExUnit(e.target.value)} placeholder="단위(회,분…)" style={{padding:"6px 8px",borderRadius:8,border:"1.5px solid #e0d8f8",fontSize:12}}/>:<div/>}
              <button onClick={addExercise} style={{padding:"6px",borderRadius:8,background:P,color:"#fff",border:"none",cursor:"pointer",fontWeight:700}}>추가</button>
            </div>
          </div>
          <div style={CARD}>
            <h3 style={{fontSize:13,fontWeight:700,color:P,marginBottom:8}}>👦👧 학생 관리</h3>
            <div style={{maxHeight:160,overflowY:"auto",marginBottom:8}}>
              {data.users.filter(u=>u.role==="student").slice().sort((a,b)=>a.classNum-b.classNum||a.name.localeCompare(b.name,"ko")).map(s=>(
                <div key={s.id} style={{display:"flex",alignItems:"center",gap:7,background:"#f8f4ff",borderRadius:10,padding:"6px 10px",marginBottom:4,fontSize:12}}>
                  <span>{s.gender==="남"?"👦":"👧"}</span>
                  <span style={{flex:1,fontWeight:600}}>{s.name}</span>
                  <span style={{fontSize:10,color:"#aaa"}}>{s.grade}학년 {s.classNum}반</span>
                  <button onClick={()=>removeStudent(s.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#e05555",fontSize:12,padding:0}}>✕</button>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:5,marginBottom:5}}>
              <input value={newStudent.name} onChange={e=>setNewStudent(s=>({...s,name:e.target.value}))} placeholder="이름" style={{padding:"6px 8px",borderRadius:8,border:"1.5px solid #e0d8f8",fontSize:13}}/>
              <select value={newStudent.grade} onChange={e=>setNewStudent(s=>({...s,grade:e.target.value}))} style={{padding:"6px",borderRadius:8,border:"1.5px solid #e0d8f8",fontSize:12}}>
                {data.grades.map(g=><option key={g} value={g}>{g}학년</option>)}
              </select>
              <select value={newStudent.classNum} onChange={e=>setNewStudent(s=>({...s,classNum:e.target.value}))} style={{padding:"6px",borderRadius:8,border:"1.5px solid #e0d8f8",fontSize:12}}>
                {data.classes.map(n=><option key={n} value={n}>{n}반</option>)}
              </select>
              <select value={newStudent.gender} onChange={e=>setNewStudent(s=>({...s,gender:e.target.value}))} style={{padding:"6px",borderRadius:8,border:"1.5px solid #e0d8f8",fontSize:12}}>
                <option value="남">남</option><option value="여">여</option>
              </select>
            </div>
            <button onClick={addStudent} style={{width:"100%",padding:9,borderRadius:10,background:P,color:"#fff",fontWeight:700,border:"none",cursor:"pointer",fontSize:13}}>+ 학생 추가</button>
          </div>
        </div>)}

        {goalPopup&&(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.35)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}}>
          <div style={{background:"#fff",borderRadius:20,padding:"32px 40px",textAlign:"center"}}>
            <div style={{fontSize:52,marginBottom:10}}>🎯</div>
            <div style={{fontSize:20,fontWeight:700,color:P,marginBottom:6}}>목표 설정 완료!</div>
            <div style={{fontSize:14,color:"#aaa"}}>학생에게 목표가 전달됐어요</div>
          </div>
        </div>)}
      </div>
    );
  }

  return null;
}