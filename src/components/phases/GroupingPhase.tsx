'use client';

import { useState, useEffect, useRef } from 'react';
import { Session, Participant, Response } from '@/lib/api';
import { socketService } from '@/lib/socket';

interface GroupingPhaseProps {
  session: Session;
  participant: Participant;
  isConnected: boolean;
}

interface ResponseCardProps {
  response: Response;
  isLocked: boolean;
  isDropTarget: boolean;
}

function ResponseCard({ response, isLocked, isDropTarget }: ResponseCardProps) {
  const isGood = response.category === 'WENT_WELL';
  return (
    <div
      className={`rounded-xl w-48 relative transition-all duration-150 select-none ${
        isGood
          ? 'bg-gradient-to-br from-emerald-50 to-green-100 border-l-4 border-l-emerald-400'
          : 'bg-gradient-to-br from-rose-50 to-red-100 border-l-4 border-l-rose-400'
      } ${isDropTarget ? 'ring-2 ring-blue-500 ring-offset-2' : ''} ${
        isLocked ? 'opacity-40' : ''
      }`}
      style={{
        boxShadow: isDropTarget
          ? '0 0 0 3px rgba(59,130,246,0.4), 0 4px 12px rgba(0,0,0,0.12)'
          : '0 2px 8px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
        border: isGood ? '1px solid #6ee7b7' : '1px solid #fca5a5',
        borderLeft: isGood ? '4px solid #34d399' : '4px solid #f87171',
      }}
    >
      <div className="px-3 pt-3 pb-2">
        <p className="text-gray-800 text-sm font-medium leading-snug">{response.content}</p>
      </div>
      <div className={`px-3 pb-2 flex items-center justify-between ${isGood ? 'border-t border-emerald-200/60' : 'border-t border-rose-200/60'}`}>
        <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500">
          <span className="text-sm">{response.participant?.avatarId}</span>
          <span className="truncate max-w-20">{response.participant?.displayName}</span>
        </div>
        <span className={`mt-1.5 inline-block px-1.5 py-0.5 rounded-full text-xs font-semibold ${
          isGood ? 'bg-emerald-200/80 text-emerald-800' : 'bg-rose-200/80 text-rose-800'
        }`}>
          {isGood ? '😊' : '😕'}
        </span>
      </div>
      {isLocked && (
        <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-white/30 backdrop-blur-[1px]">
          <span className="text-base">🔒</span>
        </div>
      )}
    </div>
  );
}

const CARD_W = 192; // w-48 = 12rem = 192px
const CARD_H = 120;
const EMIT_THROTTLE_MS = 50;

interface GroupLabelInputProps {
  groupId: string;
  sessionId: string;
  color: string;
  label: string;
}

function GroupLabelInput({ groupId, sessionId, color, label }: GroupLabelInputProps) {
  const [localLabel, setLocalLabel] = useState(label);
  const [focused, setFocused] = useState(false);

  // Sync external label changes when not focused (another user renamed)
  useEffect(() => {
    if (!focused) setLocalLabel(label);
  }, [label, focused]);

  const save = () => {
    setFocused(false);
    socketService.emit('rename_group', { sessionId, groupId, label: localLabel });
  };

  return (
    <input
      type="text"
      value={localLabel}
      placeholder="Group name…"
      maxLength={100}
      onChange={e => setLocalLabel(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      onMouseDown={e => e.stopPropagation()}
      style={{ borderColor: color, color }}
      className="text-xs font-semibold px-2 py-0.5 rounded-full border-2 bg-white shadow-sm w-36 text-center focus:outline-none focus:shadow-md placeholder-gray-300 cursor-text"
    />
  );
}

function cardsOverlap(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return (
    a.x < b.x + CARD_W &&
    a.x + CARD_W > b.x &&
    a.y < b.y + CARD_H &&
    a.y + CARD_H > b.y
  );
}

export default function GroupingPhase({ session, participant, isConnected }: GroupingPhaseProps) {
  const [responses, setResponses] = useState<Response[]>([]);
  const [cardPositions, setCardPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  // groups: groupId → cardIds[]
  const [groups, setGroups] = useState<Map<string, string[]>>(new Map());
  // groupColors: groupId → hex color string
  const [groupColors, setGroupColors] = useState<Map<string, string>>(new Map());
  // groupLabels: groupId → label string
  const [groupLabels, setGroupLabels] = useState<Map<string, string>>(new Map());
  // cards currently locked by other users
  const [lockedCards, setLockedCards] = useState<Set<string>>(new Set());
  // card being hovered over during a drag
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Drag state refs (used inside document event handlers — never stale)
  const draggingGroupRef = useRef<string[]>([]); // all cardIds moving together
  const dragAnchorRef = useRef<string | null>(null); // the card the user clicked
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lastEmitRef = useRef<number>(0);

  // Mirrors of state for use inside stable document event handlers
  const cardPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lockedCardsRef = useRef<Set<string>>(new Set());
  // cardId → groupId — rebuilt whenever `groups` changes
  const cardGroupRef = useRef<Map<string, string>>(new Map());

  // Keep refs in sync with state
  useEffect(() => { cardPositionsRef.current = cardPositions; }, [cardPositions]);
  useEffect(() => { lockedCardsRef.current = lockedCards; }, [lockedCards]);
  useEffect(() => {
    const map = new Map<string, string>();
    for (const [groupId, cardIds] of groups) {
      cardIds.forEach(id => map.set(id, groupId));
    }
    cardGroupRef.current = map;
  }, [groups]);

  // ── Initialise from session snapshot ──────────────────────────────────────

  useEffect(() => {
    if (!session.responses) return;

    const canvas = canvasRef.current;
    const canvasW = canvas?.offsetWidth ?? 760;

    const positions = new Map<string, { x: number; y: number }>();

    // Seeded pseudo-random for reproducible layout (same each time page loads for unplaced cards)
    let seed = 42;
    const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };

    session.responses.forEach(r => {
      if (r.positionX !== 0 || r.positionY !== 0) {
        positions.set(r.id, { x: r.positionX, y: r.positionY });
      } else {
        // Bad (DIDNT_GO_WELL) → left third; Good (WENT_WELL) → right two-thirds
        const isGood = r.category === 'WENT_WELL';
        const zoneStart = isGood ? Math.floor(canvasW * 0.35) : 16;
        const zoneEnd   = isGood ? canvasW - CARD_W - 16 : Math.floor(canvasW * 0.6) - CARD_W;
        const zoneW = Math.max(0, zoneEnd - zoneStart);
        const x = Math.round(zoneStart + rand() * zoneW);
        const y = Math.round(16 + rand() * Math.max(0, 600 - CARD_H - 80));
        positions.set(r.id, { x, y });
      }
    });

    setCardPositions(positions);
    setResponses(session.responses);

    // Derive group membership from responses' groupId field
    const groupsMap = new Map<string, string[]>();
    session.responses.forEach(r => {
      if (r.groupId) {
        const existing = groupsMap.get(r.groupId) ?? [];
        groupsMap.set(r.groupId, [...existing, r.id]);
      }
    });
    setGroups(groupsMap);

    // Group colors and labels from session.groups
    const colorsMap = new Map<string, string>();
    const labelsMap = new Map<string, string>();
    session.groups?.forEach(g => {
      colorsMap.set(g.id, g.color);
      if (g.label) labelsMap.set(g.id, g.label);
    });
    setGroupColors(colorsMap);
    setGroupLabels(labelsMap);
  }, [session.responses, session.groups]);

  // ── Socket event listeners ─────────────────────────────────────────────────

  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleCardMoved = (data: { responseId: string; x: number; y: number }) => {
      setCardPositions(prev => new Map(prev).set(data.responseId, { x: data.x, y: data.y }));
    };

    const handleGroupMoved = (data: { positions: Record<string, { x: number; y: number }> }) => {
      setCardPositions(prev => {
        const next = new Map(prev);
        for (const [id, pos] of Object.entries(data.positions)) {
          next.set(id, pos);
        }
        return next;
      });
    };

    const handleCardsLocked = (data: { cardIds: string[] }) => {
      setLockedCards(prev => {
        const next = new Set(prev);
        data.cardIds.forEach(id => next.add(id));
        return next;
      });
    };

    const handleCardsUnlocked = (data: { cardIds: string[] }) => {
      setLockedCards(prev => {
        const next = new Set(prev);
        data.cardIds.forEach(id => next.delete(id));
        return next;
      });
    };

    const handleCardsGrouped = (data: { groupId: string; cardIds: string[] }) => {
      setGroups(prev => {
        const next = new Map(prev);
        // Remove these cardIds from any existing group entries
        for (const [gId, ids] of next) {
          const filtered = ids.filter(id => !data.cardIds.includes(id));
          if (filtered.length === 0) {
            next.delete(gId);
          } else if (filtered.length !== ids.length) {
            next.set(gId, filtered);
          }
        }
        next.set(data.groupId, data.cardIds);
        return next;
      });
      setGroupColors(prev => {
        if (prev.has(data.groupId)) return prev;
        const next = new Map(prev);
        next.set(data.groupId, '#3B82F6');
        return next;
      });
    };

    const handleCardUngrouped = (data: { cardId: string; groupId: string }) => {
      setGroups(prev => {
        const next = new Map(prev);
        const ids = next.get(data.groupId);
        if (ids) {
          const filtered = ids.filter(id => id !== data.cardId);
          if (filtered.length <= 1) {
            next.delete(data.groupId);
          } else {
            next.set(data.groupId, filtered);
          }
        }
        return next;
      });
    };

    const handleGroupDissolved = (data: { groupId: string }) => {
      setGroups(prev => { const next = new Map(prev); next.delete(data.groupId); return next; });
      setGroupColors(prev => { const next = new Map(prev); next.delete(data.groupId); return next; });
      setGroupLabels(prev => { const next = new Map(prev); next.delete(data.groupId); return next; });
    };

    const handleGroupRenamed = (data: { groupId: string; label: string | null }) => {
      setGroupLabels(prev => {
        const next = new Map(prev);
        if (data.label) next.set(data.groupId, data.label);
        else next.delete(data.groupId);
        return next;
      });
    };

    // lock_rejected: another user already holds the card — cancel our drag
    const handleLockRejected = () => {
      if (!dragAnchorRef.current) return;
      // Restore positions to where they were when drag started
      setCardPositions(prev => {
        const next = new Map(prev);
        for (const [id, pos] of dragStartPositionsRef.current) {
          next.set(id, pos);
        }
        return next;
      });
      draggingGroupRef.current = [];
      dragAnchorRef.current = null;
      setDropTargetId(null);
    };

    socket.on('card_moved', handleCardMoved);
    socket.on('group_moved', handleGroupMoved);
    socket.on('cards_locked', handleCardsLocked);
    socket.on('cards_unlocked', handleCardsUnlocked);
    socket.on('cards_grouped', handleCardsGrouped);
    socket.on('card_ungrouped', handleCardUngrouped);
    socket.on('group_dissolved', handleGroupDissolved);
    socket.on('group_renamed', handleGroupRenamed);
    socket.on('lock_rejected', handleLockRejected);

    return () => {
      socket.off('card_moved', handleCardMoved);
      socket.off('group_moved', handleGroupMoved);
      socket.off('cards_locked', handleCardsLocked);
      socket.off('cards_unlocked', handleCardsUnlocked);
      socket.off('cards_grouped', handleCardsGrouped);
      socket.off('card_ungrouped', handleCardUngrouped);
      socket.off('group_dissolved', handleGroupDissolved);
      socket.off('group_renamed', handleGroupRenamed);
      socket.off('lock_rejected', handleLockRejected);
    };
  }, []);

  // ── Document-level mouse handlers ──────────────────────────────────────────

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const anchor = dragAnchorRef.current;
      if (!anchor || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();

      // New position for the anchor card
      const rawX = e.clientX - rect.left - dragOffsetRef.current.x;
      const rawY = e.clientY - rect.top - dragOffsetRef.current.y;
      const newAnchorX = Math.max(0, Math.min(rawX, canvas.offsetWidth - CARD_W));
      const newAnchorY = Math.max(0, Math.min(rawY, canvas.offsetHeight - CARD_H));

      // Delta from drag-start position of the anchor
      const startAnchor = dragStartPositionsRef.current.get(anchor) ?? { x: 0, y: 0 };
      const dx = newAnchorX - startAnchor.x;
      const dy = newAnchorY - startAnchor.y;

      // Apply same delta to every card in the dragging group
      setCardPositions(prev => {
        const next = new Map(prev);
        for (const id of draggingGroupRef.current) {
          const start = dragStartPositionsRef.current.get(id) ?? { x: 0, y: 0 };
          next.set(id, {
            x: Math.max(0, Math.min(start.x + dx, canvas.offsetWidth - CARD_W)),
            y: Math.max(0, Math.min(start.y + dy, canvas.offsetHeight - CARD_H)),
          });
        }
        return next;
      });

      // Detect drop target: first non-dragging card overlapping the anchor's new pos
      const draggingSet = new Set(draggingGroupRef.current);
      let newDropTarget: string | null = null;
      for (const [otherId, otherPos] of cardPositionsRef.current) {
        if (draggingSet.has(otherId)) continue;
        if (cardsOverlap({ x: newAnchorX, y: newAnchorY }, otherPos)) {
          newDropTarget = otherId;
          break;
        }
      }
      setDropTargetId(newDropTarget);

      // Throttled live broadcast
      const now = Date.now();
      if (now - lastEmitRef.current > EMIT_THROTTLE_MS) {
        lastEmitRef.current = now;
        const draggingIds = draggingGroupRef.current;

        if (draggingIds.length === 1) {
          socketService.emit('drag_response', {
            sessionId: session.id,
            responseId: draggingIds[0],
            x: newAnchorX,
            y: newAnchorY,
            isDragging: true,
          });
        } else {
          const positions: Record<string, { x: number; y: number }> = {};
          for (const id of draggingIds) {
            const start = dragStartPositionsRef.current.get(id) ?? { x: 0, y: 0 };
            positions[id] = {
              x: Math.max(0, Math.min(start.x + dx, canvas.offsetWidth - CARD_W)),
              y: Math.max(0, Math.min(start.y + dy, canvas.offsetHeight - CARD_H)),
            };
          }
          socketService.emit('drag_group', { sessionId: session.id, positions, isDragging: true });
        }
      }
    };

    const handleMouseUp = () => {
      const anchor = dragAnchorRef.current;
      if (!anchor) return;

      const draggingIds = [...draggingGroupRef.current]; // copy before clearing
      dragAnchorRef.current = null;
      draggingGroupRef.current = [];
      setDropTargetId(null);

      // Release locks
      socketService.emit('unlock_cards', { sessionId: session.id, cardIds: draggingIds });

      // Re-compute drop target from final positions (don't rely on stale state)
      const currentPositions = cardPositionsRef.current;
      const draggingSet = new Set(draggingIds);
      const anchorPos = currentPositions.get(anchor);
      let dropTarget: string | null = null;
      if (anchorPos) {
        for (const [otherId, otherPos] of currentPositions) {
          if (draggingSet.has(otherId)) continue;
          if (cardsOverlap(anchorPos, otherPos)) {
            dropTarget = otherId;
            break;
          }
        }
      }

      // Collect final positions for persistence
      const finalPositions: Record<string, { x: number; y: number }> = {};
      draggingIds.forEach(id => {
        const pos = currentPositions.get(id);
        if (pos) finalPositions[id] = pos;
      });

      if (dropTarget) {
        socketService.emit('group_cards', {
          sessionId: session.id,
          cardId1: anchor,
          cardId2: dropTarget,
        });
      }

      // Always persist final positions regardless of grouping
      if (draggingIds.length === 1) {
        const pos = finalPositions[anchor];
        if (pos) {
          socketService.emit('drag_response', {
            sessionId: session.id,
            responseId: anchor,
            x: pos.x,
            y: pos.y,
            isDragging: false,
          });
        }
      } else {
        socketService.emit('drag_group', {
          sessionId: session.id,
          positions: finalPositions,
          isDragging: false,
        });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [session.id]); // stable — all mutable values accessed via refs

  // ── Card interaction handlers ──────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent, responseId: string) => {
    if (e.button !== 0) return;
    e.preventDefault();

    // Don't drag a card locked by another user
    if (lockedCardsRef.current.has(responseId)) return;

    // Collect the dragging group (the card's full group, or just the card itself)
    const groupId = cardGroupRef.current.get(responseId);
    const draggingIds = groupId ? (groups.get(groupId) ?? [responseId]) : [responseId];

    // Don't drag if any other group member is locked
    if (draggingIds.some(id => id !== responseId && lockedCardsRef.current.has(id))) return;

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    const anchorPos = cardPositionsRef.current.get(responseId) ?? { x: 0, y: 0 };

    dragAnchorRef.current = responseId;
    draggingGroupRef.current = draggingIds;
    dragOffsetRef.current = {
      x: e.clientX - canvasRect.left - anchorPos.x,
      y: e.clientY - canvasRect.top - anchorPos.y,
    };

    // Snapshot start positions for delta-based group movement
    const startPositions = new Map<string, { x: number; y: number }>();
    draggingIds.forEach(id => {
      startPositions.set(id, { ...(cardPositionsRef.current.get(id) ?? { x: 0, y: 0 }) });
    });
    dragStartPositionsRef.current = startPositions;

    socketService.emit('lock_cards', { sessionId: session.id, cardIds: draggingIds });
  };

  const handleDoubleClick = (e: React.MouseEvent, responseId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const groupId = cardGroupRef.current.get(responseId);
    if (!groupId) return;

    // Cancel any in-progress drag and restore start positions
    if (dragAnchorRef.current) {
      const draggingIds = [...draggingGroupRef.current];
      socketService.emit('unlock_cards', { sessionId: session.id, cardIds: draggingIds });
      setCardPositions(prev => {
        const next = new Map(prev);
        for (const [id, pos] of dragStartPositionsRef.current) next.set(id, pos);
        return next;
      });
      dragAnchorRef.current = null;
      draggingGroupRef.current = [];
      setDropTargetId(null);
    }

    socketService.emit('ungroup_card', { sessionId: session.id, cardId: responseId });
  };

  // ── Derived render data ────────────────────────────────────────────────────

  // Group envelopes: bounding boxes rendered behind the cards
  const groupEnvelopes = Array.from(groups.entries()).flatMap(([groupId, cardIds]) => {
    const positions = cardIds.map(id => cardPositions.get(id)).filter(
      (p): p is { x: number; y: number } => p !== undefined
    );
    if (positions.length < 2) return [];
    const minX = Math.min(...positions.map(p => p.x)) - 12;
    const minY = Math.min(...positions.map(p => p.y)) - 12;
    const maxX = Math.max(...positions.map(p => p.x + CARD_W)) + 12;
    const maxY = Math.max(...positions.map(p => p.y + CARD_H)) + 12;
    const color = groupColors.get(groupId) ?? '#3B82F6';
    const label = groupLabels.get(groupId) ?? '';
    return [{ groupId, minX, minY, width: maxX - minX, height: maxY - minY, color, label }];
  });

  const maxCardY = cardPositions.size > 0
    ? Math.max(...Array.from(cardPositions.values()).map(p => p.y))
    : 0;
  const canvasMinHeight = Math.max(600, maxCardY + CARD_H + 80);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Grouping Phase</h1>
        <p className="text-gray-600">
          Drop cards onto each other to group them. Double-click a grouped card to detach it.
        </p>

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
          <p className="text-gray-600 mb-6">Make sure you added responses in the Input phase first.</p>
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
          className="rounded-xl border border-gray-200 relative select-none overflow-hidden"
          style={{
            minHeight: `${canvasMinHeight}px`,
            background: '#fafbfc',
            backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.04), 0 1px 8px rgba(0,0,0,0.06)',
          }}
        >
          {/* Zone watermarks — behind everything */}
          <div className="absolute inset-0 pointer-events-none flex" style={{ zIndex: 0 }}>
            <div className="flex-1 flex items-center justify-center">
              <span className="text-5xl font-black tracking-tight select-none" style={{ color: 'rgba(239,68,68,0.07)' }}>😕 Didn&apos;t go well</span>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <span className="text-5xl font-black tracking-tight select-none" style={{ color: 'rgba(16,185,129,0.07)' }}>😊 Went well</span>
            </div>
          </div>

          {/* Group envelopes — behind cards (z-index 0) */}
          {groupEnvelopes.map(env => (
            <div key={env.groupId}>
              {/* Background envelope */}
              <div
                style={{
                  position: 'absolute',
                  left: env.minX,
                  top: env.minY,
                  width: env.width,
                  height: env.height,
                  background: `${env.color}18`,
                  border: `2px dashed ${env.color}99`,
                  borderRadius: 16,
                  zIndex: 0,
                  pointerEvents: 'none',
                  boxShadow: `inset 0 0 0 1px ${env.color}22, 0 2px 12px ${env.color}18`,
                }}
              />
              {/* Group name badge — centered on the top border */}
              <div
                style={{
                  position: 'absolute',
                  left: env.minX + env.width / 2,
                  top: Math.max(4, env.minY - 12),
                  transform: 'translateX(-50%)',
                  zIndex: 10,
                }}
              >
                <GroupLabelInput
                  groupId={env.groupId}
                  sessionId={session.id}
                  color={env.color}
                  label={env.label}
                />
              </div>
            </div>
          ))}

          {/* Cards */}
          {responses.map(response => {
            const pos = cardPositions.get(response.id) ?? { x: 0, y: 0 };
            const isDraggingThis = draggingGroupRef.current.includes(response.id);
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
                  transform: isDraggingThis ? 'scale(1.04) rotate(-1deg)' : 'scale(1)',
                  filter: isDraggingThis ? 'drop-shadow(0 12px 24px rgba(0,0,0,0.22))' : undefined,
                  transition: isDraggingThis ? 'none' : 'transform 150ms ease, filter 150ms ease',
                }}
                className={lockedCards.has(response.id) ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}
                onMouseDown={e => handleMouseDown(e, response.id)}
                onDoubleClick={e => handleDoubleClick(e, response.id)}
              >
                <ResponseCard
                  response={response}
                  isLocked={lockedCards.has(response.id)}
                  isDropTarget={dropTargetId === response.id}
                />
              </div>
            );
          })}

          {/* Hint */}
          <div className="absolute top-4 right-4 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700 z-30 pointer-events-none">
            💡 Drop cards onto each other to group · Double-click to ungroup
          </div>
        </div>
      )}
    </div>
  );
}
