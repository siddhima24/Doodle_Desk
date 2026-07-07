// client/src/App.js
import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

// const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
// const socket = io(BACKEND_URL);
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'] 
});

function App() {
  const [text, setText] = useState('');
  const [screen, setScreen] = useState('auth'); 
  
  // User & Room Data
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [message, setMessage] = useState('');
  const [activeUsers, setActiveUsers] = useState([]);
  const [pendingList, setPendingList] = useState([]);

  // Drawing States
  const canvasRef = useRef(null);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [savedDrawings, setSavedDrawings] = useState([]);
  
  // Stroke Grouping ID
  const currentStrokeId = useRef('');

  // Live Interaction States
  const [remoteCursors, setRemoteCursors] = useState({}); // { username: { x, y } }
  const [typingUsers, setTypingUsers] = useState({});   // { username: true/false }
  const typingTimeoutRef = useRef(null);
  
  // Advanced Tools
  const [brushColor, setBrushColor] = useState('#5c4033'); 
  const [brushSize, setBrushSize] = useState(2);
  const [isEraser, setIsEraser] = useState(false);

  const colors = ['#5c4033', '#8b0000', '#00008b', '#006400', '#ff8c00', '#4b0082'];

  // --- AUTO-LOGIN ENGINE ---
  useEffect(() => {
    const savedUser = localStorage.getItem('cafe_user');
    const savedPass = localStorage.getItem('cafe_pass');
    const savedRoom = localStorage.getItem('cafe_room');
    const savedRoomPass = localStorage.getItem('cafe_room_pass');

    if (savedUser && savedPass) {
      socket.emit('login', { username: savedUser, password: savedPass }, (res) => {
        if (res.success) {
          setUsername(savedUser);
          setPassword(savedPass);
          
          if (savedRoom && savedRoomPass) {
            socket.emit('join-room', { roomName: savedRoom, password: savedRoomPass, username: savedUser }, (roomRes) => {
              if (roomRes.success) {
                setRoomName(savedRoom);
                setRoomPassword(savedRoomPass);
                setText(roomRes.text);
                setActiveUsers(roomRes.users);
                setSavedDrawings(roomRes.drawings || []);
                setScreen('workspace');
              } else {
                setScreen('room-select');
              }
            });
          } else {
            setScreen('room-select'); 
          }
        } else {
          localStorage.clear();
        }
      });
    }
  }, []);

  // --- BASIC SYNCING ---
  useEffect(() => {
    socket.on('receive-changes', (newText) => setText(newText));
    socket.on('update-users', (users) => setActiveUsers(users));
    // Add these inside your existing socket event listener useEffect block:
    socket.on('receive-mouse-move', ({ username, x, y }) => {
     setRemoteCursors(prev => ({ ...prev, [username]: { x, y } }));
    });

    socket.on('receive-typing-status', ({ username, isTyping }) => {
     setTypingUsers(prev => ({ ...prev, [username]: isTyping }));
    });
    return () => {
      socket.off('receive-changes');
      socket.off('update-users');
      socket.off('receive-mouse-move');
      socket.off('receive-typing-status');

    };
  }, []);

  // --- UPGRADED DRAWING LOGIC ---
  const drawLine = (x0, y0, x1, y1, color, size, strokeId, emit = true) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    
    context.beginPath();
    context.moveTo(x0, y0);
    context.lineTo(x1, y1);
    
    if (color === 'eraser') {
      context.globalCompositeOperation = 'destination-out';
      context.strokeStyle = 'rgba(0,0,0,1)'; 
    } else {
      context.globalCompositeOperation = 'source-over';
      context.strokeStyle = color;
    }
    
    context.lineWidth = size;
    context.lineCap = 'round'; 
    context.stroke();
    context.closePath();

    const strokeData = { x0, y0, x1, y1, color, size, strokeId };

    if (emit) {
      socket.emit('draw-stroke', { roomName, stroke: strokeData });
      setSavedDrawings(prev => [...prev, strokeData]);
    }
  };

  const onMouseDown = (e) => {
    if (!isDrawingMode) return;
    setIsDrawing(true);
    currentStrokeId.current = Date.now().toString(); 
  };

  const onMouseMove = (e) => {
    if (!isDrawing || !isDrawingMode) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const currentColor = isEraser ? 'eraser' : brushColor;
    drawLine(x - e.movementX, y - e.movementY, x, y, currentColor, brushSize, currentStrokeId.current, true);
  };

  const onMouseUp = () => setIsDrawing(false);

  // --- LIVE DOODLE & UNDO LISTENER ---
  useEffect(() => {
    socket.on('receive-stroke', (stroke) => {
      setSavedDrawings(prev => [...prev, stroke]);
      drawLine(stroke.x0, stroke.y0, stroke.x1, stroke.y1, stroke.color, stroke.size, stroke.strokeId, false);
    });

    socket.on('receive-undo', (undoneStrokeId) => {
      setSavedDrawings(prev => {
        const updated = prev.filter(s => s.strokeId !== undoneStrokeId);
        const canvas = canvasRef.current;
        if (canvas) {
          const context = canvas.getContext('2d');
          context.clearRect(0, 0, canvas.width, canvas.height);
          updated.forEach(s => drawLine(s.x0, s.y0, s.x1, s.y1, s.color, s.size, s.strokeId, false));
        }
        return updated;
      });
    });

    return () => {
      socket.off('receive-stroke');
      socket.off('receive-undo');
    };
  }, []);

  // --- HISTORY REDRAWER ---
  useEffect(() => {
    if (screen === 'workspace' && canvasRef.current && savedDrawings.length > 0) {
      setTimeout(() => {
        savedDrawings.forEach(stroke => {
          drawLine(stroke.x0, stroke.y0, stroke.x1, stroke.y1, stroke.color, stroke.size, stroke.strokeId, false);
        });
      }, 50);
    }
  }, [screen, savedDrawings]);

  // --- EVENT HANDLERS ---
  const handleUndo = () => {
    if (savedDrawings.length === 0) return;

    const lastStrokeId = savedDrawings[savedDrawings.length - 1].strokeId;
    socket.emit('undo-stroke', { roomName, strokeId: lastStrokeId });

    const updatedDrawings = savedDrawings.filter(s => s.strokeId !== lastStrokeId);
    setSavedDrawings(updatedDrawings);

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);

    updatedDrawings.forEach(stroke => {
      drawLine(stroke.x0, stroke.y0, stroke.x1, stroke.y1, stroke.color, stroke.size, stroke.strokeId, false);
    });
  };

  const handleAuth = (e) => {
    e.preventDefault();
    if (username === 'admin') {
      socket.emit('admin-login', password, (res) => {
        if (res.success) { setPendingList(res.pending); setScreen('admin'); }
        else setMessage(res.message);
      });
    } else {
      socket.emit('login', { username, password }, (res) => {
        if (res.success) {
          localStorage.setItem('cafe_user', username);
          localStorage.setItem('cafe_pass', password);
          setMessage(''); setScreen('room-select');
        } else {
          socket.emit('request-registration', { username, password }, (regRes) => {
            setMessage(regRes.message);
          });
        }
      });
    }
  };

  const handleAdminApprove = (userToApprove) => {
    socket.emit('admin-approve', userToApprove);
    setPendingList(pendingList.filter(u => u !== userToApprove));
    alert(`Approved ${userToApprove}! They can now enter with their chosen password.`);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    socket.emit('join-room', { roomName, password: roomPassword, username }, (res) => {
      if (res.success) {
        localStorage.setItem('cafe_room', roomName);
        localStorage.setItem('cafe_room_pass', roomPassword);
        setText(res.text); setActiveUsers(res.users); 
        setSavedDrawings(res.drawings || []);
        setScreen('workspace');
      } else {
        setMessage(res.message);
      }
    });
  };

  const handleChange = (e) => {
    setText(e.target.value);
    socket.emit('send-changes', { roomName, newText: e.target.value });
    handleTyping(); // 👈 Trigger typing notification here
  };

  const handleLeave = () => {
    localStorage.clear();
    window.location.reload(); 
  };

  // Track mouse coordinates relative to the editor space
  const handleWorkspaceMouseMove = (e) => {
    if (screen !== 'workspace') return;
    const container = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - container.left;
    const y = e.clientY - container.top;

    socket.emit('mouse-move', { roomName, username, x, y });
  };

  // Broadcast typing status with a built-in timeout deceleration
  const handleTyping = () => {
    socket.emit('typing-status', { roomName, username, isTyping: true });

    // Clear any previous countdown timer
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // Set a new timer to turn off the typing status after 1.5 seconds of silence
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing-status', { roomName, username, isTyping: false });
    }, 1500);
  };

  // --- RENDER SCREENS ---
  if (screen === 'auth') {
    return (
      <div className="login-overlay">
        <div className="login-card">
          <h2>Welcome to the Cafe</h2>
          <form onSubmit={handleAuth}>
            <input className="login-input" placeholder="Your Name" value={username} onChange={e => setUsername(e.target.value)} required />
            <input className="login-input" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button className="login-btn" type="submit">Knock / Enter</button>
          </form>
          {message && <p style={{ color: '#ffda75', marginTop: '15px' }}>{message}</p>}
        </div>
      </div>
    );
  }

  if (screen === 'admin') {
    return (
      <div className="login-overlay">
        <div className="login-card" style={{ width: '400px' }}>
          <h2>Admin Dashboard</h2>
          <h3 style={{ color: '#f4e8c1', marginBottom: '10px' }}>Pending Approvals:</h3>
          {pendingList.length === 0 ? <p style={{color:'#f4e8c1'}}>No pending users.</p> : 
            pendingList.map(u => (
              <div key={u} style={{ background: '#fff', padding: '10px', marginBottom: '5px', display: 'flex', justifyContent: 'space-between', borderRadius: '4px' }}>
                <span style={{ color: '#333', fontWeight: 'bold' }}>{u}</span>
                <button onClick={() => handleAdminApprove(u)} style={{ cursor: 'pointer', padding: '4px 8px' }}>Approve</button>
              </div>
            ))
          }
        </div>
      </div>
    );
  }

  if (screen === 'room-select') {
    return (
      <div className="login-overlay">
        <div className="login-card">
          <h2>Find a Table</h2>
          <form onSubmit={handleJoinRoom}>
            <input className="login-input" placeholder="Table Name" value={roomName} onChange={e => setRoomName(e.target.value)} required />
            <input className="login-input" type="password" placeholder="Table Password" value={roomPassword} onChange={e => setRoomPassword(e.target.value)} required />
            <button className="login-btn" type="submit">Sit Down</button>
          </form>
          {message && <p style={{ color: '#ffda75', marginTop: '15px' }}>{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="sidebar">
        <h2>At the Table</h2>
        <ul className="user-list">
          {activeUsers.map((user, i) => (
             <li key={i}>
               ☕ {user} 
               {/* Show an animation indicator if this person is typing */}
               {typingUsers[user] && user !== username && <span style={{ color: '#ffda75', fontSize: '0.85rem' }}> (scribbling...)</span>}
             </li>
          ))}
        </ul>

        {/* The Draw Toggle Button */}
        <button 
          onClick={() => setIsDrawingMode(!isDrawingMode)} 
          style={{ marginTop: '20px', padding: '10px', background: isDrawingMode ? '#8b6b4a' : 'transparent', color: '#f8f8f8', border: '2px dashed #8b6b4a', cursor: 'pointer', fontFamily: 'inherit', transition: '0.2s' }}
        >
          {isDrawingMode ? '🖍️ Doodling Mode ON' : '⌨️ Typing Mode ON'}
        </button>

        {/* Tool Palette (Only shows when doodling) */}
        {isDrawingMode && (
          <div style={{ marginTop: '15px', padding: '15px', background: 'rgba(255,255,255,0.05)', border: '1px solid #4a3320', borderRadius: '8px' }}>
            
            <button 
              onClick={handleUndo}
              style={{ width: '100%', padding: '8px', marginBottom: '10px', background: 'transparent', color: '#ffda75', border: '1px dashed #ffda75', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}
            >
              ↩️ Undo Last Stroke
            </button>

            <button 
              onClick={() => setIsEraser(!isEraser)}
              style={{ width: '100%', padding: '8px', marginBottom: '15px', background: isEraser ? '#ffda75' : '#2b3a32', color: isEraser ? '#333' : '#f8f8f8', border: '1px solid #4a3320', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}
            >
              {isEraser ? '🧼 Eraser Active' : '🧽 Switch to Eraser'}
            </button>

            <p style={{ fontSize: '0.9rem', marginBottom: '5px', color: '#ccc' }}>Ink Color:</p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', flexWrap: 'wrap' }}>
              {colors.map(color => (
                <div 
                  key={color} 
                  onClick={() => { setBrushColor(color); setIsEraser(false); }}
                  style={{ width: '25px', height: '25px', backgroundColor: color, borderRadius: '50%', cursor: 'pointer', border: brushColor === color && !isEraser ? '2px solid #ffda75' : '2px solid transparent' }}
                />
              ))}
            </div>

            <p style={{ fontSize: '0.9rem', marginBottom: '5px', color: '#ccc' }}>Brush Size:</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[2, 6, 12, 40].map(size => (
                <button 
                  key={size}
                  onClick={() => setBrushSize(size)}
                  style={{ flex: 1, padding: '5px', background: brushSize === size ? '#4a3320' : 'transparent', color: '#f8f8f8', border: '1px solid #4a3320', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  {size === 2 ? 'Fine' : size === 6 ? 'Med' : size === 12 ? 'Thick' : 'Jumbo'}
                </button>
              ))}
            </div>
          </div>
        )}

        <button 
          onClick={handleLeave} 
          style={{ marginTop: 'auto', padding: '10px', background: '#5c4033', color: '#f4e8c1', border: '1px solid #8b6b4a', borderRadius: '4px', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Pack up & Leave 🎒
        </button>
      </div>

      <div className="workspace">
        <div className="header">
          <h1 className="room-title">{roomName}</h1>
        </div>
        
        <div 
          className="editor-container" 
          style={{ position: 'relative', overflow: 'hidden' }}
          onMouseMove={handleWorkspaceMouseMove} // 👈 Track movements here
        >
          <textarea 
            className="text-editor" 
            value={text} 
            onChange={handleChange} 
            placeholder="Type away..." 
            style={{ pointerEvents: isDrawingMode ? 'none' : 'auto' }} 
          />
          
          <canvas
            ref={canvasRef}
            width={800} 
            height={600}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseOut={onMouseUp}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: isDrawingMode ? 'auto' : 'none', 
            }}
          />

          {/* NEW: Render Floating Remote Cursors */}
          {Object.keys(remoteCursors).map((user) => {
            const cursor = remoteCursors[user];
            if (!cursor) return null;
            return (
              <div
                key={user}
                style={{
                  position: 'absolute',
                  top: cursor.y,
                  left: cursor.x,
                  pointerEvents: 'none',
                  zIndex: 50,
                  transition: 'all 0.1s ease-out', // Makes cursor movement smooth
                }}
              >
                {/* Custom Ink Pen / Arrow pointer */}
                <span style={{ fontSize: '1.2rem' }}>✒️</span>
                {/* Username Label banner */}
                <div style={{
                  backgroundColor: '#4a3320',
                  color: '#ffda75',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontFamily: 'sans-serif',
                  whiteSpace: 'nowrap',
                  marginTop: '-4px',
                  marginLeft: '10px',
                  boxShadow: '2px 2px 5px rgba(0,0,0,0.2)'
                }}>
                  {user} {typingUsers[user] ? '✍️...' : ''}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

export default App;