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
      className={`response-card-visual p-3 rounded-lg border-2 shadow-sm transition-colors duration-200 w-48 relative ${
        response.category === 'WENT_WELL'
          ? 'bg-green-50 border-green-300'
          : 'bg-red-50 border-red-300'
      } ${isSelected ? 'ring-2 ring-green-500 ring-offset-2' : ''}`}
    >
      {/* Chain icon */}
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

const CARD_W = 192; // w-48 = 12rem = 192px
const CARD_H = 120; // approximate card height
const EMIT_THROTTLE_MS = 50;

export default function GroupingPhase({ session, participant, isConnected }: GroupingPhaseProps) {
  const [responses, setResponses] = useState<Response[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [cardPositions, setCardPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [isDrawingConnection, setIsDrawingConnection] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [selectedCardPosition, setSelectedCardPosition] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const draggingIdRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastEmitRef = useRef<number>(0);
  // Keep a ref to cardPositions so mouseup closure always has current positions
  const cardPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Sync ref whenever state changes
  useEffect(() => {
    cardPositionsRef.current = cardPositions;
  }, [cardPositions]);

  // Initialize positions from session data
  useEffect(() => {
    if (!session.responses) return;

    const canvas = canvasRef.current;
    const canvasW = canvas?.offsetWidth ?? 760;
    const colRightX = Math.floor(canvasW / 2) + 8;

    const positions = new Map<string, { x: number; y: number }>();
    const wentWell = session.responses.filter(r => r.category === 'WENT_WELL');
    const didntGoWell = session.responses.filter(r => r.category === 'DIDNT_GO_WELL');

    session.responses.forEach((r) => {
      if (r.positionX !== 0 || r.positionY !== 0) {
        // Use saved position from DB
        positions.set(r.id, { x: r.positionX, y: r.positionY });
      } else {
        // Calculate default grid position
        const isLeft = r.category === 'WENT_WELL';
        const idx = isLeft ? wentWell.indexOf(r) : didntGoWell.indexOf(r);
        positions.set(r.id, {
          x: isLeft ? 16 : colRightX,
          y: 16 + idx * 160,
        });
      }
    });

    setCardPositions(positions);
    setResponses(session.responses);

    if (session.connections) {
      setConnections(session.connections);
    }
  }, [session.responses, session.connections]);

  // Socket event listeners
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleConnectionCreated = (connection: Connection) => {
      setConnections(prev => [...prev, connection]);
    };

    const handleConnectionRemoved = (data: { connectionId: string }) => {
      setConnections(prev => prev.filter(conn => conn.id !== data.connectionId));
    };

    const handleCardMoved = (data: { responseId: string; x: number; y: number }) => {
      setCardPositions(prev => new Map(prev).set(data.responseId, { x: data.x, y: data.y }));
    };

    socket.on('connection_created', handleConnectionCreated);
    socket.on('connection_removed', handleConnectionRemoved);
    socket.on('card_moved', handleCardMoved);

    return () => {
      socket.off('connection_created', handleConnectionCreated);
      socket.off('connection_removed', handleConnectionRemoved);
      socket.off('card_moved', handleCardMoved);
    };
  }, []);

  // Mouse tracking for connection drawing + card dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();

      // Always track cursor for SVG connection line preview
      setCursorPosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });

      // Handle card drag
      if (draggingIdRef.current) {
        const rawX = e.clientX - rect.left - dragOffsetRef.current.x;
        const rawY = e.clientY - rect.top - dragOffsetRef.current.y;
        const x = Math.max(0, Math.min(rawX, canvasRef.current.offsetWidth - CARD_W));
        const y = Math.max(0, Math.min(rawY, canvasRef.current.offsetHeight - CARD_H));

        setCardPositions(prev => new Map(prev).set(draggingIdRef.current!, { x, y }));

        const now = Date.now();
        if (now - lastEmitRef.current > EMIT_THROTTLE_MS) {
          socketService.emit('drag_response', {
            sessionId: session.id,
            responseId: draggingIdRef.current,
            x,
            y,
            isDragging: true,
          });
          lastEmitRef.current = now;
        }
      }
    };

    const handleMouseUp = () => {
      if (!draggingIdRef.current) return;
      const id = draggingIdRef.current;
      draggingIdRef.current = null;
      const pos = cardPositionsRef.current.get(id);
      if (pos) {
        socketService.emit('drag_response', {
          sessionId: session.id,
          responseId: id,
          x: pos.x,
          y: pos.y,
          isDragging: false,
        });
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawingConnection) {
        setIsDrawingConnection(false);
        setSelectedCardId(null);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    if (isDrawingConnection) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDrawingConnection, session.id]);

  const handleMouseDown = (e: React.MouseEvent, responseId: string) => {
    // Only start drag on left-click; ignore if clicking the chain button
    if (e.button !== 0) return;
    e.preventDefault();
    const pos = cardPositions.get(responseId) ?? { x: 0, y: 0 };
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;
    draggingIdRef.current = responseId;
    dragOffsetRef.current = {
      x: e.clientX - canvasRect.left - pos.x,
      y: e.clientY - canvasRect.top - pos.y,
    };
  };

  const handleChainClick = (responseId: string) => {
    if (isDrawingConnection && selectedCardId) {
      if (selectedCardId !== responseId) {
        createConnection(selectedCardId, responseId);
      }
      setIsDrawingConnection(false);
      setSelectedCardId(null);
    } else {
      setSelectedCardId(responseId);
      setIsDrawingConnection(true);

      setTimeout(() => {
        const containerElement = document.querySelector(`[data-response-id="${responseId}"]`) as HTMLElement;
        if (containerElement && canvasRef.current) {
          const visualCardElement = containerElement.querySelector('.response-card-visual') as HTMLElement;
          if (visualCardElement) {
            const canvasRect = canvasRef.current.getBoundingClientRect();
            const cardRect = visualCardElement.getBoundingClientRect();
            setSelectedCardPosition({
              x: cardRect.left - canvasRect.left + cardRect.width,
              y: cardRect.top - canvasRect.top + cardRect.height / 2,
            });
          }
        }
      }, 10);
    }
  };

  const createConnection = (fromId: string, toId: string) => {
    const exists = connections.some(conn =>
      (conn.fromResponseId === fromId && conn.toResponseId === toId) ||
      (conn.fromResponseId === toId && conn.toResponseId === fromId)
    );
    if (!exists) {
      socketService.emit('create_connection', {
        sessionId: session.id,
        fromResponseId: fromId,
        toResponseId: toId,
      });
    }
  };

  const removeConnection = (connectionId: string) => {
    socketService.emit('remove_connection', {
      sessionId: session.id,
      connectionId,
    });
  };

  // Get card anchor position for SVG connection lines (right-edge center)
  const getCardPosition = (responseId: string) => {
    const containerElement = document.querySelector(`[data-response-id="${responseId}"]`) as HTMLElement;
    if (containerElement && canvasRef.current) {
      const visualCardElement = containerElement.querySelector('.response-card-visual') as HTMLElement;
      if (visualCardElement) {
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const cardRect = visualCardElement.getBoundingClientRect();
        return {
          x: cardRect.left - canvasRect.left + cardRect.width,
          y: cardRect.top - canvasRect.top + cardRect.height / 2,
        };
      }
    }
    return { x: 0, y: 0 };
  };

  const ConnectionLines = () => (
    <svg
      className="absolute inset-0"
      style={{ zIndex: 10, pointerEvents: 'none' }}
      width="100%"
      height="100%"
    >
      <rect width="100%" height="100%" fill="transparent" style={{ pointerEvents: 'none' }} />

      {connections.map((connection) => {
        const fromPos = getCardPosition(connection.fromResponseId);
        const toPos = getCardPosition(connection.toResponseId);
        const isSameColumn = Math.abs(fromPos.x - toPos.x) < 100;
        let pathData: string;

        if (isSameColumn) {
          const controlOffset = 225;
          const midY = (fromPos.y + toPos.y) / 2;
          const controlX = Math.max(fromPos.x, toPos.x) + controlOffset;
          pathData = `M ${fromPos.x} ${fromPos.y} Q ${controlX} ${midY} ${toPos.x} ${toPos.y}`;
        } else {
          pathData = `M ${fromPos.x} ${fromPos.y} L ${toPos.x} ${toPos.y}`;
        }

        return (
          <g key={connection.id} style={{ pointerEvents: 'all' }}>
            <path
              d={pathData}
              stroke="transparent"
              strokeWidth="16"
              fill="none"
              className="cursor-pointer"
              style={{ pointerEvents: 'stroke' }}
              onClick={(e) => {
                e.stopPropagation();
                removeConnection(connection.id);
              }}
              onMouseEnter={(e) => {
                const visiblePath = e.currentTarget.nextElementSibling as SVGPathElement;
                if (visiblePath) { visiblePath.style.stroke = '#ef4444'; visiblePath.style.strokeWidth = '4'; }
              }}
              onMouseLeave={(e) => {
                const visiblePath = e.currentTarget.nextElementSibling as SVGPathElement;
                if (visiblePath) { visiblePath.style.stroke = '#10b981'; visiblePath.style.strokeWidth = '3'; }
              }}
            />
            <path
              d={pathData}
              stroke="#10b981"
              strokeWidth="3"
              fill="none"
              className="transition-all duration-200"
              style={{ pointerEvents: 'none' }}
            />
          </g>
        );
      })}

      {isDrawingConnection && selectedCardId && (
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
      )}
    </svg>
  );

  const maxCardY = cardPositions.size > 0
    ? Math.max(...Array.from(cardPositions.values()).map(p => p.y))
    : 0;
  const canvasMinHeight = Math.max(600, maxCardY + CARD_H + 80);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Grouping Phase</h1>
        <p className="text-gray-600">Drag cards to group related feedback. Click 🔗 to connect cards.</p>

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

      {responses.length === 0 ? (
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
          className="bg-white rounded-xl border-2 border-gray-300 relative select-none"
          style={{ minHeight: `${canvasMinHeight}px` }}
        >
          <ConnectionLines />

          {responses.map((response) => {
            const pos = cardPositions.get(response.id) ?? { x: 0, y: 0 };
            const isDraggingThis = draggingIdRef.current === response.id;
            return (
              <div
                key={response.id}
                data-response-id={response.id}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  zIndex: isDraggingThis ? 20 : 1,
                  userSelect: 'none',
                }}
                className="cursor-grab active:cursor-grabbing"
                onMouseDown={(e) => handleMouseDown(e, response.id)}
              >
                <ResponseCard
                  response={response}
                  onChainClick={handleChainClick}
                  isSelected={selectedCardId === response.id}
                />
              </div>
            );
          })}

          {isDrawingConnection ? (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-green-100 border border-green-300 rounded-lg px-4 py-2 text-sm text-green-800 z-30 pointer-events-none">
              Click on another card to connect, or press Escape to cancel
            </div>
          ) : connections.length > 0 && (
            <div className="absolute top-4 right-4 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 z-30 pointer-events-none">
              💡 Click on connection lines to remove them
            </div>
          )}
        </div>
      )}
    </div>
  );
}
