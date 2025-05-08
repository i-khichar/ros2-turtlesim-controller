import React, { useState, useEffect, useRef } from 'react';

function App() {
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [x, setX] = useState(window.innerWidth / 2);
  const [y, setY] = useState(window.innerHeight / 2);
  const [marking, setMarking] = useState(false);
  const [trail, setTrail] = useState([]);
  const [startStation, setStartStation] = useState(null);
  const [endStation, setEndStation] = useState(null);
  const [missionStatus, setMissionStatus] = useState(false);
  const [ws, setWs] = useState(null);

  function mapUiToTurtle(uiX, uiY, canvasWidth, canvasHeight) {
    const turtleX = (uiX / canvasWidth) * 11;
    const turtleY = 11 - (uiY / canvasHeight) * 11;
    return { turtleX, turtleY };
  }  

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8080');
    socket.onopen = () => console.log('WebSocket connected');
    setWs(socket);
    return () => socket.close();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setCanvasSize({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    if (trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      trail.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }

    if (startStation) {
      ctx.fillStyle = 'green';
      ctx.fillRect(startStation.x - 5, startStation.y - 5, 10, 10);
    }
    if (endStation) {
      ctx.fillStyle = 'red';
      ctx.fillRect(endStation.x - 5, endStation.y - 5, 10, 10);
      setMarking(false);
    }

    ctx.fillStyle = 'blue';
    ctx.fillRect(x - 10, y - 10, 20, 20);
  }, [x, y, trail, startStation, endStation, canvasSize]);

  const move = (dx, dy) => {
    if(missionStatus) return;
    let newX = Math.max(10, Math.min(canvasSize.width - 10, x + dx));
    let newY = Math.max(10, Math.min(canvasSize.height - 10, y + dy));
    setX(newX);
    setY(newY);
    if (marking) setTrail(prev => [...prev, { x: newX, y: newY }]);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const { turtleX, turtleY } = mapUiToTurtle(newX, newY, canvasSize.width, canvasSize.height);
      ws.send(JSON.stringify({
        type: 'teleport',
        x: turtleX,
        y: turtleY,
        theta: 0
      }));
    }
  };

  const handleKey = (e) => {
    if (e.key === 'ArrowUp') move(0, -10);
    if (e.key === 'ArrowDown') move(0, 10);
    if (e.key === 'ArrowLeft') move(-10, 0);
    if (e.key === 'ArrowRight') move(10, 0);
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [x, y, marking, canvasSize]);

  const toggleMarking = () => {
    if (!marking) {
      setStartStation({ x, y });
      setEndStation(null);
      setTrail([{ x, y }]);
    }
    setMarking(prev => !prev);
  };

  const savePath = async () => {
    const pathName = prompt("Enter path name:");
    if (!pathName) return;
    const payload = {
      pathName,
      trail,
      startStation,
      endStation
    };
    try {
      const response = await fetch('/api/savePath', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      alert(result.message || 'Saved!');
    } catch (err) {
      console.error(err);
      alert('Failed to save path');
    }
  };

  const startMission = async () => {
    if (!startStation || trail.length < 2) {
      alert('No path to follow!');
      return;
    }
    
    if(!endStation) {
      alert('Please set end station!');
      return;
    }

    if(missionStatus) {
      alert('Wait for ongoing mission to finish!');
      return;
    }

    setMissionStatus(true);

    setX(startStation.x);
    setY(startStation.y);
  
    if (ws && ws.readyState === WebSocket.OPEN) {
      const { turtleX, turtleY } = mapUiToTurtle(startStation.x, startStation.y, canvasSize.width, canvasSize.height);
      ws.send(JSON.stringify({
        type: 'teleport',
        x: turtleX,
        y: turtleY,
        theta: 0
      }));
    }
  
    for (let i = 0; i < trail.length; i++) {
      await new Promise(res => setTimeout(res, 300)); // delay for visible movement
      setX(trail[i].x);
      setY(trail[i].y);
      if (ws && ws.readyState === WebSocket.OPEN) {
        const { turtleX, turtleY } = mapUiToTurtle(trail[i].x, trail[i].y, canvasSize.width, canvasSize.height);
        ws.send(JSON.stringify({
          type: 'teleport',
          x: turtleX,
          y: turtleY,
          theta: 0
        }));
      }
    }

    setMissionStatus(false)
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{ display: 'block' }}
      />

      <div style={{
        position: 'absolute',
        top: 10,
        left: 10,
        backgroundColor: 'white',
        padding: '10px',
        border: '1px solid black'
      }}>
        <button onClick={toggleMarking}>
          {marking ? 'Stop Marking' : 'Start Marking'}
        </button>
        {marking && <button onClick={() => setEndStation({ x, y })}>Set End Station</button>}
        <button onClick={startMission}>
          Start Mission
        </button>
        {endStation && (
          <button onClick={savePath}>
            Save Path
          </button>
        )}
      </div>

      {/* Arrow keys bottom-right */}
      <div style={{
        position: 'absolute',
        bottom: 30,
        right: 30,
        display: 'grid',
        gridTemplateColumns: '40px 40px 40px',
        gridTemplateRows: '40px 40px',
        gap: '5px'
      }}>
        <div></div>
        <button onClick={() => move(0, -10)}>↑</button>
        <div></div>
        <button onClick={() => move(-10, 0)}>←</button>
        <button onClick={() => move(0, 10)}>↓</button>
        <button onClick={() => move(10, 0)}>→</button>
      </div>
    </div>
  );
}

export default App;
