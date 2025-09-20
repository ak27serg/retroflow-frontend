'use client';

import { useState, useEffect, useRef } from 'react';
import { Session, Participant, Response, Connection } from '@/lib/api';
import { socketService } from '@/lib/socket';

interface GroupingPhaseProps {
  session: Session;
  participant: Participant;
  isConnected: boolean;
}

interface ResponseCardProps {
  response: Response;
  onChainClick: (responseId: string) => void;
  isSelected: boolean;
}

function ResponseCard({ response, onChainClick, isSelected }: ResponseCardProps) {
  return (
    <div
      className={`p-3 rounded-lg border-2 shadow-sm transition-all duration-200 w-48 relative ${
        response.category === 'WENT_WELL'
          ? 'bg-green-50 border-green-300'
          : 'bg-red-50 border-red-300'
      } ${isSelected ? 'ring-2 ring-green-500 ring-offset-2' : ''}`}
    >
      {/* Chain icon in top right corner */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onChainClick(response.id);
        }}
        className="absolute -top-2 -right-2 w-6 h-6 bg-white border-2 border-gray-300 rounded-full flex items-center justify-center hover:bg-gray-50 hover:border-gray-400 transition-colors shadow-sm"
        title="Connect to another card"
      >
        <span className="text-xs">🔗</span>
      </button>

      <p className="text-gray-900 text-sm font-medium leading-tight">{response.content}</p>
      <div className="flex items-center gap-2 mt-2 text-xs text-gray-600">
        <span>{response.participant?.avatarId}</span>
        <span>{response.participant?.displayName}</span>
      </div>
      <div className="mt-1 flex justify-between items-center">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
          response.category === 'WENT_WELL'
            ? 'bg-green-200 text-green-800'
            : 'bg-red-200 text-red-800'
        }`}>
          {response.category === 'WENT_WELL' ? '😊' : '😕'}
        </span>
      </div>
    </div>
  );
}


export default function GroupingPhase({ session, participant, isConnected }: GroupingPhaseProps) {
  const [responses, setResponses] = useState<Response[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isDrawingConnection, setIsDrawingConnection] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [selectedCardPosition, setSelectedCardPosition] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);




  useEffect(() => {
    // Initialize with session data if available
    if (session.responses) {
      setResponses(session.responses);
    }
    if (session.connections) {
      setConnections(session.connections);
    }
  }, [session.responses, session.connections]);

  // Socket event listeners for real-time connections
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleConnectionCreated = (connection: Connection) => {
      setConnections(prev => [...prev, connection]);
    };

    const handleConnectionRemoved = (data: { connectionId: string }) => {
      setConnections(prev => prev.filter(conn => conn.id !== data.connectionId));
    };

    socket.on('connection_created', handleConnectionCreated);
    socket.on('connection_removed', handleConnectionRemoved);

    return () => {
      socket.off('connection_created', handleConnectionCreated);
      socket.off('connection_removed', handleConnectionRemoved);
    };
  }, []);

  // Mouse tracking for drawing connection lines and cursor coordinates
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const newPosition = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
        setCursorPosition(newPosition);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawingConnection) {
        setIsDrawingConnection(false);
        setSelectedCardId(null);
      }
    };

    // Always track mouse movement when over the canvas area
    document.addEventListener('mousemove', handleMouseMove);
    
    if (isDrawingConnection) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDrawingConnection]);

  const handleChainClick = (responseId: string) => {
    if (isDrawingConnection && selectedCardId) {
      // If we're already drawing and click on a different card, create connection
      if (selectedCardId !== responseId) {
        createConnection(selectedCardId, responseId);
      }
      // Reset drawing state
      setIsDrawingConnection(false);
      setSelectedCardId(null);
    } else {
      // Start drawing a connection
      setSelectedCardId(responseId);
      setIsDrawingConnection(true);
      
      // Get the position of the selected card with a small delay to ensure element is rendered
      setTimeout(() => {
        const cardElement = document.querySelector(`[data-response-id="${responseId}"]`) as HTMLElement;
        if (cardElement && canvasRef.current) {
          const canvasRect = canvasRef.current.getBoundingClientRect();
          const cardRect = cardElement.getBoundingClientRect();
          const centerPosition = {
            x: cardRect.left - canvasRect.left + cardRect.width / 2,
            y: cardRect.top - canvasRect.top + cardRect.height / 2
          };
          setSelectedCardPosition(centerPosition);
        }
      }, 10);
    }
  };

  const createConnection = (fromId: string, toId: string) => {
    // Check if connection already exists
    const exists = connections.some(conn => 
      (conn.fromResponseId === fromId && conn.toResponseId === toId) ||
      (conn.fromResponseId === toId && conn.toResponseId === fromId)
    );

    if (!exists) {
      // Emit to backend
      socketService.emit('create_connection', {
        sessionId: session.id,
        fromResponseId: fromId,
        toResponseId: toId
      });
    }
  };

  const removeConnection = (connectionId: string) => {
    console.log('removeConnection called with connectionId:', connectionId);
    // Emit to backend
    socketService.emit('remove_connection', {
      sessionId: session.id,
      connectionId: connectionId
    });
  };

  const getCardPosition = (responseId: string) => {
    const cardElement = document.querySelector(`[data-response-id="${responseId}"]`) as HTMLElement;
    if (cardElement && canvasRef.current) {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const cardRect = cardElement.getBoundingClientRect();
      const position = {
        x: cardRect.left - canvasRect.left + cardRect.width / 2,
        y: cardRect.top - canvasRect.top + cardRect.height / 2
      };
      console.log('getCardPosition debug:', {
        responseId,
        canvasRect: { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height },
        cardRect: { left: cardRect.left, top: cardRect.top, width: cardRect.width, height: cardRect.height },
        calculatedPosition: position
      });
      return position;
    }
    console.warn('Card element not found for responseId:', responseId);
    return { x: 0, y: 0 };
  };

  // Component for rendering connection lines
  const ConnectionLines = () => {
    return (
      <svg
        className="absolute inset-0"
        style={{ zIndex: 1, pointerEvents: 'none' }}
        width="100%"
        height="100%"
      >
        {/* Existing connections */}
        {connections.map((connection) => {
          const fromPos = getCardPosition(connection.fromResponseId);
          const toPos = getCardPosition(connection.toResponseId);
          
          console.log('Rendering connection:', connection.id, 'from', fromPos, 'to', toPos);
          
          return (
            <g key={connection.id} style={{ pointerEvents: 'auto' }}>
              <line
                x1={fromPos.x}
                y1={fromPos.y}
                x2={toPos.x}
                y2={toPos.y}
                stroke="#10b981"
                strokeWidth="3"
                className="cursor-pointer"
                onClick={(e) => {
                  console.log('Line clicked!', connection.id);
                  e.stopPropagation();
                  removeConnection(connection.id);
                }}
              />
              {/* Add a small circle at the midpoint for easier clicking */}
              <circle
                cx={(fromPos.x + toPos.x) / 2}
                cy={(fromPos.y + toPos.y) / 2}
                r="6"
                fill="#10b981"
                className="cursor-pointer"
                onClick={(e) => {
                  console.log('Circle clicked!', connection.id);
                  e.stopPropagation();
                  removeConnection(connection.id);
                }}
              >
                <title>Click to remove connection</title>
              </circle>
              {/* Debug circles to show line endpoints */}
              <circle cx={fromPos.x} cy={fromPos.y} r="8" fill="#ff0000" opacity="0.5" style={{ pointerEvents: 'none' }} />
              <circle cx={toPos.x} cy={toPos.y} r="8" fill="#0000ff" opacity="0.5" style={{ pointerEvents: 'none' }} />
            </g>
          );
        })}
        
        {/* Drawing line following cursor */}
        {isDrawingConnection && selectedCardId && (
          <>
            <line
              x1={selectedCardPosition.x}
              y1={selectedCardPosition.y}
              x2={cursorPosition.x}
              y2={cursorPosition.y}
              stroke="#10b981"
              strokeWidth="3"
              strokeDasharray="5,5"
              style={{ pointerEvents: 'none' }}
            />
            {/* Debug circle to show where drawing line starts */}
            <circle 
              cx={selectedCardPosition.x} 
              cy={selectedCardPosition.y} 
              r="10" 
              fill="#ff00ff" 
              opacity="0.7" 
              style={{ pointerEvents: 'none' }} 
            />
          </>
        )}
      </svg>
    );
  };




  const ungroupedResponses = responses;


  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Grouping Phase</h1>
        <p className="text-gray-600">Review the responses from the input phase</p>
        
        {participant.isHost && (
          <div className="flex gap-3 justify-center mt-4">
            <button
              onClick={() => socketService.emit('change_phase', { sessionId: session.id, phase: 'INPUT' })}
              disabled={!isConnected}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2"
            >
              ← Back to Input
            </button>
            <button
              onClick={() => socketService.emit('change_phase', { sessionId: session.id, phase: 'VOTING' })}
              disabled={!isConnected}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
            >
              Move to Voting →
            </button>
          </div>
        )}
      </div>

      {ungroupedResponses.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📝</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Responses Found</h3>
          <p className="text-gray-600 mb-6">
            Make sure you added responses in the Input phase first.
          </p>
          <button
            onClick={() => socketService.emit('change_phase', { sessionId: session.id, phase: 'INPUT' })}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold"
          >
            Go back to Input Phase
          </button>
        </div>
      ) : (
        <div 
          ref={canvasRef}
          className="bg-white rounded-xl border-2 border-gray-300 min-h-[600px] p-6 relative"
        >
          {/* Cursor coordinates display */}
          <div className="absolute top-4 right-4 bg-gray-100 border border-gray-300 rounded px-3 py-1 text-sm font-mono text-gray-700 z-10">
            {cursorPosition.x.toFixed(0)}, {cursorPosition.y.toFixed(0)}
          </div>
          
          {/* Connection lines overlay */}
          <ConnectionLines />
          
          <div className="grid md:grid-cols-2 gap-8 relative" style={{ zIndex: 2 }}>
            <div>
              <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center gap-2">
                😊 What went well?
              </h3>
              <div className="space-y-4">
                {responses.filter(r => r.category === 'WENT_WELL').map((response) => (
                  <div key={response.id} data-response-id={response.id}>
                    <ResponseCard 
                      response={response} 
                      onChainClick={handleChainClick}
                      isSelected={selectedCardId === response.id}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-red-800 mb-4 flex items-center gap-2">
                😕 What didn&apos;t go well?
              </h3>
              <div className="space-y-4">
                {responses.filter(r => r.category === 'DIDNT_GO_WELL').map((response) => (
                  <div key={response.id} data-response-id={response.id}>
                    <ResponseCard 
                      response={response} 
                      onChainClick={handleChainClick}
                      isSelected={selectedCardId === response.id}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* Instructions when drawing */}
          {isDrawingConnection && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-green-100 border border-green-300 rounded-lg px-4 py-2 text-sm text-green-800 z-10">
              Click on another card to connect, or press Escape to cancel
            </div>
          )}
        </div>
      )}
    </div>
  );
}