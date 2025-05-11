import React, { useState, useEffect, useRef } from 'react';

function App() {
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [x, setX] = useState(window.innerWidth / 2);
  const [y, setY] = useState(window.innerHeight / 2);
  const [theta, setTheta] = useState(0); // angle in radians
  const [marking, setMarking] = useState(false); // true if marking path
  const [trail, setTrail] = useState([]); // array of points - linearX, angularZ
  const [startStation, setStartStation] = useState(null);  //TODO: make 2 stations and we can choose which one to start from
  const [endStation, setEndStation] = useState(null);
  const [missionStatus, setMissionStatus] = useState(false);
  const [webSocketConnection, setWebSocketConnection] = useState(null); //webSocketConnection is the websocket connection
  let reversedPath = false; // true if path is reversed
  const [pathName, setPathName] = useState(null); // path name to be saved  
  const [drawpath, setDrawPath] = useState([]); // array of points drawn on canvas

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8080');  //websocked connection to the backend
    socket.onopen = () => {
      console.log('WebSocket connected');
    };
    setWebSocketConnection(socket);
    return () => socket.close();
  }, []);

  useEffect(() => {
    if(!webSocketConnection) return;
    webSocketConnection.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'pose') {
        const canvasX = (data.x / 11) * canvasSize.width;
        const canvasY = canvasSize.height - (data.y / 11) * canvasSize.height;
        setX(canvasX);
        setY(canvasY);
        if(marking){
          setDrawPath(prev => [...prev, { x: canvasX, y: canvasY }]);
        }
      }
  };
}, [webSocketConnection, canvasSize, marking]);

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

    if (drawpath.length > 1) {
      ctx.beginPath();
      ctx.moveTo(drawpath[0].x, drawpath[0].y);
      drawpath.forEach(p => ctx.lineTo(p.x, p.y));
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

  }, [x, y, drawpath, startStation, endStation, canvasSize]);

  const move = (distance, rotation) => {
    // if(missionStatus) return;
    // Only push if it's different from the last point to avoid duplicates
    if (marking) {
      if(trail.length === 0 || trail[trail.length - 1].distance !== distance || trail[trail.length - 1].rotation !== rotation) {
        setTrail(prev => [...prev, { distance, rotation }]);
      }
    }

    let linearX = 0;
    let angularZ = 0;

    if(distance === -5 && rotation === 0) linearX = 0.5;
    if(distance === 5 && rotation === 0 ) linearX = -0.5; 
    if(distance === 0 && rotation === -5) angularZ = 1;
    if(distance === 0 && rotation === 5) angularZ = -1;
    if (webSocketConnection && webSocketConnection.readyState === WebSocket.OPEN) {
      webSocketConnection.send(JSON.stringify({
        type: 'move',
        linearX,
        angularZ
      }));
    }
  };

  const handleKey = (e) => {
    if (e.key === 'ArrowUp') move(-5, 0);
    if (e.key === 'ArrowDown') move(5, 0);
    if (e.key === 'ArrowLeft') move(0, -5);
    if (e.key === 'ArrowRight') move(0, 5);
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [x, y, marking, canvasSize]);

  const handleKeyUp = () => {
    if(webSocketConnection && webSocketConnection.readyState === WebSocket.OPEN) {
      webSocketConnection.send(JSON.stringify({
        type: 'stop'
      }));
    }
  };
  useEffect(() => {
    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, [webSocketConnection]);


  const toggleMarking = () => {
    if (!marking) {
      setStartStation({ x, y });
      setEndStation(null);
      setDrawPath([{ x, y }]);
    }
    setMarking(prev => !prev);
  };

  const savePath = async () => {
    const name = prompt("Enter path name:");
    // if (!name) return;
    const payload = {
      pathName: name,
      trail,
      startStation,
      endStation
    };
    console.log(payload);
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
    setPathName(name);
  };

  const startMission = async () => {
    if (!startStation) {
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

    if(!pathName) {
      alert('Please set path name!');
      return;
    }

    //fetching path from mongoDB
    //we have to fetch path from the backend (mongoDB) and then move the turtle along the path depending on the start and end station
    const response = await fetch(`/api/getPath?pathName=${pathName}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    const data = await response.json();
    console.log("here" + data.result.path);
    if (!data || !data.result || !data.result.path) {
      alert('No path found!');
      return;
    }

    if(reversedPath) {
      data.result.path.coordinates.reverse();
      for (let i = 0; i < data.result.path.coordinates.length; i++) {
        data.result.path.coordinates[i][1] = -data.result.path.coordinates[i][1];
      }
      setStartStation(data.result.path.endStation);
      setEndStation(data.result.path.startStation);
    } else {
      setStartStation(data.result.path.startStation);
      setEndStation(data.result.path.endStation);
    }

    //seems unnecessary since there is a websocket subscription to the turtle pose
    // setX(startStation.x);
    // setY(startStation.y);
    // setTheta(0);
    
    setMissionStatus(true);
    //teleport the turtle to the start station
    if(webSocketConnection && webSocketConnection.readyState === WebSocket.OPEN) {
      const turtleX = (startStation.x / canvasSize.width) * 11;  //coordinates to the turtle world
      const turtleY = 11 - (startStation.y / canvasSize.height) * 11;
      webSocketConnection.send(JSON.stringify({
        type: 'teleport',
        x: turtleX,
        y: turtleY,
        theta: 0
      }));
    }

    for (const [distance, rotation] of data.result.path.coordinates) {
      console.log(distance, rotation);
      move(distance, rotation);
    }
    // for (let i = 0; i < data.result.path.coordinates.length; i++) {
    //   await new Promise(res => setTimeout(res, 300)); // delay for visible movement
    //   move(data.result.path.coordinates[i][0], data.result.path.coordinates[i][1]);
    // }

    setMissionStatus(false);
  };

  const swapStations = () => {
    reversedPath = !reversedPath;
  }

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
        {startStation && endStation && (
          <button onClick={swapStations}>
          Swap Start and End Stations
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
        <button onClick={() => move(-5, 0)}>↑</button>
        <div></div>
        <button onClick={() => move(0, -5)}>←</button>
        <button onClick={() => move(5, 0)}>↓</button>
        <button onClick={() => move(0, 5)}>→</button>
      </div>
    </div>
  );
}

export default App;
