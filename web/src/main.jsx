import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {MessageSquare,History,Compass,Building2,KanbanSquare,Boxes,KeyRound,Brain,Workflow,Timer,Signal,Settings,Plus,Search,Bell,Mail,Code2,Clock3,ChartNoAxesCombined,ChevronDown,Paperclip,FolderOpen,Globe2,Zap,Send,RefreshCw,ExternalLink,ToggleLeft,ToggleRight} from "lucide-react";
import "./styles.css";

const navTop=[
["chat","Chat",MessageSquare],["sessions","Sessions",History],["discover","Discover",Compass],["office","Office",Building2],["kanban","Kanban",KanbanSquare],["models","Models",Boxes],["providers","Providers",KeyRound],["memory","Memory",Brain],["capabilities","Capabilities",Workflow],["schedules","Schedules",Timer],["gateway","Gateway",Signal]
];
const suggestions=[
[Search,"Search the web","Search the web for today's top tech news"],
[Bell,"Set a reminder","Set a reminder to check emails every day at 9 AM"],
[Mail,"Summarize emails","Read my latest emails and summarize them"],
[Code2,"Write a script","Write a Python script to rename all files in a folder"],
[Clock3,"Schedule a cron job","Schedule a cron job to back up my database every night"],
[ChartNoAxesCombined,"Analyze data","Analyze this CSV file and show key insights"]
];

function Sidebar({view,setView}){
 return <aside className="sidebar">
   <div className="brand"><span>HERMES</span><b>ONE</b><button className="collapse">◧</button></div>
   <nav className="nav">
    {navTop.map(([id,label,Icon])=><button key={id} className={"nav-item "+(view===id?"active":"")} onClick={()=>setView(id)}><Icon size={16}/><span>{label}</span>{id==="sessions"&&<span className="chev">›</span>}</button>)}
    <button className={"nav-item "+(view==="settings"?"active":"")} onClick={()=>setView("settings")}><Settings size={16}/><span>Settings</span></button>
   </nav>
   <div className="profile"><span className="avatar">N</span><span>nick</span><ChevronDown size={14}/></div>
 </aside>
}

function Chat(){
 const [text,setText]=useState("");
 return <div className="chat">
   <div className="tabs"><div className="tab active"><span className="mini-logo">◐</span> New conversation <span>×</span></div><button className="tab-plus"><Plus size={15}/></button></div>
   <div className="chat-stage">
     <div className="hero">
       <div className="hero-logo">HERMES<br/><b>ONE</b></div>
       <h1>How can I help you today?</h1>
       <p>Ask me to write code, answer questions, search the web, and more</p>
       <div className="suggestions">{suggestions.map(([Icon,label,prompt])=><button onClick={()=>setText(prompt)} key={label}><Icon size={15}/>{label}</button>)}</div>
     </div>
   </div>
   <div className="composer-wrap">
    <div className="composer">
      <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Type a message... (Shift+Enter for new line)"/>
      <div className="composer-bar">
        <div className="left-tools"><button><Plus size={15}/></button><button><Paperclip size={15}/></button></div>
        <div className="model">glm-4.7 <ChevronDown size={12}/></div>
        <div className="mode">Auto <ChevronDown size={12}/></div>
        <button title="Quick action"><Zap size={15}/></button><button className="folder"><FolderOpen size={15}/> Choose Folder</button><button><Globe2 size={15}/></button>
        <button className="send"><Send size={15}/></button>
      </div>
    </div>
   </div>
 </div>
}

function Discover(){
 const cards=["apple-notes","apple-reminders","find-my","imessage","macos-computer-use","claude-code"];
 return <Screen title="Discover" sub="Community skills, MCP servers, agents, and workflows."><div className="segmented"><b>Skills 154</b><span>MCPs 58</span><span>Agents 17</span><span>Workflows 11</span></div><div className="toolbar"><input placeholder="Search skills..."/><button><RefreshCw size={14}/> Refresh</button><button><ExternalLink size={14}/> Open Registry</button></div><div className="card-grid">{cards.map((c,i)=><div className="card" key={c}><div className="card-icon">⌘</div><h3>{c}</h3><p>{i%2?"Connect and automate with a Hermes One integration.":"Extend Hermes with tools and reusable capabilities."}</p><div className="tags"><span>hermes</span><span>tool</span></div><button className="install">Install</button></div>)}</div></Screen>
}
function Gateway(){
 const [toggles,setToggles]=useState({telegram:true,discord:true,slack:false,matrix:false});
 return <Screen title="Gateway" sub="Manage the messaging platforms Hermes Agent can connect to."><div className="status-card"><h4>Status</h4><div><span className="dot"></span><b>Running</b><button>Stop</button><button>Restart</button></div><p>Configure platforms here. Saving changes restarts the gateway when needed.</p></div><div className="status-card"><h4>API Server Key</h4><div><span className="dot"></span><b>Key is configured</b><button>Generate key</button></div><p>This key is shared between the desktop and the local gateway.</p></div><input className="wide-search" placeholder="Search platforms or env vars"/><h5 className="section-label">PLATFORMS</h5><div className="card-grid gateway-grid">{Object.entries(toggles).map(([k,v])=><div className="card gateway-card" key={k}><div><h3>{k[0].toUpperCase()+k.slice(1)}</h3><p>Connect Hermes to {k}.</p></div><button className="toggle" onClick={()=>setToggles(t=>({...t,[k]:!v}))}>{v?<ToggleRight size={28}/>:<ToggleLeft size={28}/>}</button></div>)}</div></Screen>
}
function Schedules(){return <Screen title="Schedules" sub="Automate recurring work for Hermes."><div className="empty-panel"><h2>No scheduled tasks yet</h2><p>Create recurring automations that run through your agent.</p><button className="primary">New Task</button></div></Screen>}
function Screen({title,sub,children}){return <main className="screen"><header><h1>{title}</h1><p>{sub}</p></header>{children||<div className="empty-panel"><h2>{title}</h2><p>This Hermes One workspace is ready for the remote agent connection.</p></div>}</main>}
function App(){
 const [view,setView]=useState("chat");
 let content=<Chat/>;
 if(view==="discover")content=<Discover/>;
 else if(view==="gateway")content=<Gateway/>;
 else if(view==="schedules")content=<Schedules/>;
 else if(view!=="chat")content=<Screen title={navTop.find(x=>x[0]===view)?.[1]||"Settings"} sub={view==="settings"?"Application preferences and connection settings.":"Hermes One workspace."}/>;
 return <div className="app"><Sidebar view={view} setView={setView}/><section className="content">{content}</section></div>
}
createRoot(document.getElementById("root")).render(<App/>);