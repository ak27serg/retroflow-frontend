'use client';

import { useState, useEffect, useCallback } from 'react';
import { Session, Participant, Response, Group, apiService } from '@/lib/api';
import { socketService } from '@/lib/socket';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
// Removed unused imports: SortableContext, arrayMove, verticalListSortingStrategy
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface GroupingPhaseProps {
  session: Session;
  participant: Participant;
  isConnected: boolean;
}

interface ResponseCardProps {
  response: Response;
  isDragging?: boolean;
  onDoubleClick?: () => void;
  isTopCard?: boolean;
}

function ResponseCard({ response, isDragging, onDoubleClick, isTopCard }: ResponseCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: response.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isSortableDragging ? 0.7 : 1,
    zIndex: isDragging || isSortableDragging ? 100 : (isTopCard ? 10 : 1),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onDoubleClick={onDoubleClick}
      className={`p-3 rounded-lg border-2 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow w-48 relative ${
        response.category === 'WENT_WELL'
          ? 'bg-green-50 border-green-300 hover:bg-green-100'
          : 'bg-red-50 border-red-300 hover:bg-red-100'
      } ${response.groupId ? 'ring-2 ring-blue-200' : ''} ${isTopCard ? 'ring-4 ring-purple-300' : ''}`}
    >
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
        {response.groupId && (
          <span className="text-xs text-blue-600 font-semibold">
            {isTopCard ? '👑 Top' : 'Grouped'}
          </span>
        )}
      </div>
      {response.groupId && (
        <div className="absolute -top-1 -right-1 text-xs">
          <span className="bg-blue-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">
            📎
          </span>
        </div>
      )}
    </div>
  );
}

// Unused interface - commented out for now
/*
interface GroupLabelProps {
  group: Group;
  onLabelChange: (groupId: string, label: string) => void;
}
*/

// Unused component - commented out for now
/*
function GroupLabel({ group, onLabelChange }: GroupLabelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [labelText, setLabelText] = useState(group.label || '');

  const saveLabel = () => {
    if (labelText.trim()) {
      onLabelChange(group.id, labelText.trim());
    }
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveLabel();
    } else if (e.key === 'Escape') {
      setLabelText(group.label || '');
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={labelText}
          onChange={(e) => setLabelText(e.target.value)}
          onKeyDown={handleKeyPress}
          onBlur={saveLabel}
          className="px-2 py-1 border rounded text-sm font-semibold text-gray-900 placeholder-gray-700"
          placeholder="Group name"
          autoFocus
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-1 rounded"
      onClick={() => {
        setIsEditing(true);
        setLabelText(group.label || '');
      }}
    >
      <span className="font-semibold text-gray-800 text-sm">
        {group.label || 'Click to name group'}
      </span>
      <span className="text-gray-400 text-xs">✏️</span>
    </div>
  );
}
*/

export default function GroupingPhase({ session, participant, isConnected }: GroupingPhaseProps) {
  const [responses, setResponses] = useState<Response[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggedResponse, setDraggedResponse] = useState<Response | null>(null);
  const [hoveringOverCard, setHoveringOverCard] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const fetchSessionData = useCallback(async () => {
    try {
      const freshSession = await apiService.getSession(session.id);
      if (freshSession.responses) {
        setResponses(freshSession.responses);
      }
      if (freshSession.groups) {
        setGroups(freshSession.groups);
      }
    } catch (error) {
      console.error('Failed to fetch session data:', error);
    }
  }, [session.id]);

  useEffect(() => {
    // Initialize with session data if available
    if (session.responses) {
      setResponses(session.responses);
    }
    if (session.groups) {
      setGroups(session.groups);
    }

    // If no responses but we're in grouping phase, fetch fresh session data
    if (!session.responses || session.responses.length === 0) {
      fetchSessionData();
    }

    // Listen for real-time updates
    const socket = socketService.getSocket();
    if (!socket) return;

    // DISABLED: This was causing synchronized movement issues
    const handleResponseDragged = () => {
      // Skip updates from other clients to prevent synchronization issues
      return;
    };

    const handleGroupCreated = (group: Group) => {
      setGroups(prev => [...prev, group]);
      
      // Update responses that were assigned to this group
      if (group.responses) {
        setResponses(prev => prev.map(response => {
          const groupResponse = group.responses?.find(gr => gr.id === response.id);
          if (groupResponse) {
            return { ...response, groupId: group.id };
          }
          return response;
        }));
      }
    };

    const handleGroupUpdated = (group: Group) => {
      setGroups(prev => prev.map(g => g.id === group.id ? group : g));
    };

    const handleResponseUngrouped = (data: { responseId: string }) => {
      setResponses(prev => prev.map(r => 
        r.id === data.responseId 
          ? { ...r, groupId: null }
          : r
      ));
    };

    socket.on('response_dragged', handleResponseDragged);
    socket.on('group_created', handleGroupCreated);
    socket.on('group_updated', handleGroupUpdated);
    socket.on('response_ungrouped', handleResponseUngrouped);

    return () => {
      socket.off('response_dragged', handleResponseDragged);
      socket.off('group_created', handleGroupCreated);
      socket.off('group_updated', handleGroupUpdated);
      socket.off('response_ungrouped', handleResponseUngrouped);
    };
  }, [session, fetchSessionData]);


  // Unused function - commenting out for now
  /*
  const updateGroupLabel = (groupId: string, label: string) => {
    socketService.emit('update_group', {
      groupId,
      label
    });
  };
  */

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    
    const response = responses.find(r => r.id === active.id);
    setDraggedResponse(response || null);
  };

  // Helper function to calculate overlap percentage between two rectangles
  const calculateOverlap = (rect1: { x: number; y: number; width: number; height: number }, 
                          rect2: { x: number; y: number; width: number; height: number }) => {
    const overlapX = Math.max(0, Math.min(rect1.x + rect1.width, rect2.x + rect2.width) - Math.max(rect1.x, rect2.x));
    const overlapY = Math.max(0, Math.min(rect1.y + rect1.height, rect2.y + rect2.height) - Math.max(rect1.y, rect2.y));
    const overlapArea = overlapX * overlapY;
    const rect1Area = rect1.width * rect1.height;
    return (overlapArea / rect1Area) * 100;
  };

  // Helper function to get top card of a group (topmost position)
  const getTopCardOfGroup = (groupId: string) => {
    const groupResponses = responses.filter(r => r.groupId === groupId);
    if (groupResponses.length === 0) return null;
    // Top card is the one with smallest Y coordinate (highest on screen)
    return groupResponses.reduce((top, current) => {
      return (current.positionY || 0) < (top.positionY || 0) ? current : top;
    });
  };

  // Helper function to check if a response is the top card of its group
  const isTopCard = (response: Response) => {
    if (!response.groupId) return false;
    const topCard = getTopCardOfGroup(response.groupId);
    return topCard?.id === response.id;
  };

  // Double click handler for ungrouping
  const handleDoubleClick = (responseId: string) => {
    const response = responses.find(r => r.id === responseId);
    if (!response || !response.groupId) return;

    socketService.emit('ungroup_response', {
      responseId,
      sessionId: session.id
    });
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    
    if (!active || !over || active.id === over.id) {
      setHoveringOverCard(null);
      return;
    }

    // Check if dragging over another card
    const isOverCard = responses.some(r => r.id === over.id);
    if (isOverCard) {
      setHoveringOverCard(over.id as string);
    } else {
      setHoveringOverCard(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, delta } = event;
    
    if (!active || !delta) {
      setActiveId(null);
      setDraggedResponse(null);
      return;
    }

    const responseId = active.id as string;
    const draggedResponse = responses.find(r => r.id === responseId);
    
    if (!draggedResponse) {
      setActiveId(null);
      setDraggedResponse(null);
      return;
    }

    // Calculate new position for this specific card only
    const currentX = draggedResponse.positionX || 0;
    const currentY = draggedResponse.positionY || 0;
    
    // Add boundary constraints - card dimensions are 192x120px
    const cardWidth = 192;
    const cardHeight = 120;
    const fieldWidth = 800; // Approximate canvas width minus padding
    const fieldHeight = 500; // Approximate canvas height minus padding
    
    const newX = Math.max(0, Math.min(fieldWidth - cardWidth, currentX + delta.x));
    const newY = Math.max(0, Math.min(fieldHeight - cardHeight, currentY + delta.y));

    // Always move just this card first (no group movement for now to prevent bugs)
    setResponses(prev => prev.map(r => 
      r.id === responseId 
        ? { ...r, positionX: newX, positionY: newY }
        : r
    ));

    // Check for 70% overlap with other cards for potential grouping (but only if dragged card is not in a group)
    if (!draggedResponse.groupId) {
      const cardRect = { x: newX, y: newY, width: 192, height: 120 };
      let targetGroupId = null;
      let overlappingCard = null;

      for (const otherResponse of responses) {
        if (otherResponse.id === responseId) continue;
        
        const otherRect = { 
          x: otherResponse.positionX || 0, 
          y: otherResponse.positionY || 0, 
          width: 192, 
          height: 120 
        };
        
        const overlapPercent = calculateOverlap(cardRect, otherRect);
        
        if (overlapPercent >= 70) {
          overlappingCard = otherResponse;
          targetGroupId = otherResponse.groupId;
          break;
        }
      }

      if (overlappingCard) {
        if (targetGroupId) {
          // Join existing group
          setResponses(prev => prev.map(r => 
            r.id === responseId 
              ? { ...r, positionX: newX, positionY: newY, groupId: targetGroupId }
              : r
          ));

          socketService.emit('drag_response', {
            sessionId: session.id,
            responseId: responseId,
            x: newX,
            y: newY,
            groupId: targetGroupId
          });
        } else {
          // Create new group with both cards
          // The group name will be the content of the top card (higher Z-index/earlier in list)
          const topCard = newY < (overlappingCard.positionY || 0) ? draggedResponse : overlappingCard;
          const groupName = topCard.content.substring(0, 30) + (topCard.content.length > 30 ? '...' : '');
          
          // Update local state immediately
          setResponses(prev => prev.map(r => {
            if (r.id === responseId) {
              return { ...r, positionX: newX, positionY: newY, groupId: 'pending' };
            }
            if (r.id === overlappingCard.id) {
              return { ...r, groupId: 'pending' };
            }
            return r;
          }));

          // Create group with name from top card
          socketService.emit('create_group', {
            sessionId: session.id,
            label: groupName,
            color: `hsl(${Math.random() * 360}, 70%, 60%)`,
            responseIds: [responseId, overlappingCard.id]
          });

          // Update positions
          socketService.emit('drag_response', {
            sessionId: session.id,
            responseId: responseId,
            x: newX,
            y: newY,
            groupId: null // Will be set by backend after group creation
          });
        }
      } else {
        // No overlap, just emit the move (state already updated above)
        socketService.emit('drag_response', {
          sessionId: session.id,
          responseId: responseId,
          x: newX,
          y: newY,
          groupId: null
        });
      }
    } else {
      // Card is already in a group, just emit the move (state already updated above)
      socketService.emit('drag_response', {
        sessionId: session.id,
        responseId: responseId,
        x: newX,
        y: newY,
        groupId: draggedResponse.groupId
      });
    }

    setActiveId(null);
    setDraggedResponse(null);
    setHoveringOverCard(null);
  };

  const ungroupedResponses = responses.filter(r => !r.groupId);
  // Unused variable - commenting out for now
  /*
  const groupedResponses = groups.map(group => ({
    group,
    responses: responses.filter(r => r.groupId === group.id)
  }));
  */

  console.log('GroupingPhase Debug:', {
    totalResponses: responses.length,
    ungroupedResponses: ungroupedResponses.length,
    groups: groups.length,
    sessionResponses: session.responses?.length || 0
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Grouping Phase</h1>
        <p className="text-gray-600">Drag related items together to create groups</p>
        
        <div className="flex justify-center gap-4 mt-4">
          <div className="text-center max-w-2xl">
            <div className="bg-blue-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-700 mb-2">
                💡 <strong>Tips:</strong>
              </p>
              <ul className="text-xs text-gray-600 space-y-1 text-left">
                <li>• <strong>Group cards:</strong> Drop one card on another with 70% overlap to create a group</li>
                <li>• <strong>Group naming:</strong> Group takes the name from the topmost card</li>
                <li>• <strong>Move groups:</strong> Drag any card in a group to move the entire group together</li>
                <li>• <strong>Ungroup cards:</strong> Double-click any grouped card to remove it from the group</li>
              </ul>
            </div>
          </div>
          
          {participant.isHost && (
            <div className="flex gap-3">
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
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {/* Main Canvas Area */}
          <div className="bg-white rounded-xl border-2 border-gray-300 min-h-[600px] relative overflow-auto">
            <div className="absolute inset-0 p-6">
              {/* Render all responses positioned absolutely */}
              {responses.map((response) => {
                // Create completely independent response object for each render
                const independentResponse = {
                  id: response.id,
                  content: response.content,
                  category: response.category,
                  positionX: response.positionX,
                  positionY: response.positionY,
                  groupId: response.groupId,
                  participant: response.participant,
                  participantId: response.participantId,
                  sessionId: response.sessionId,
                  createdAt: response.createdAt,
                  updatedAt: response.updatedAt
                };
                
                // Generate stable position if none exists - arrange in neat columns
                const wentWellResponses = responses.filter(r => !r.groupId && r.category === 'WENT_WELL');
                const didntGoWellResponses = responses.filter(r => !r.groupId && r.category === 'DIDNT_GO_WELL');
                
                const getStablePosition = (id: string, axis: 'x' | 'y', category: string) => {
                  const categoryResponses = category === 'WENT_WELL' ? wentWellResponses : didntGoWellResponses;
                  const index = categoryResponses.findIndex(r => r.id === id);
                  
                  if (axis === 'x') {
                    // Create columns: positive cards on left, negative on right
                    return category === 'WENT_WELL' ? 100 : 500;
                  } else {
                    // Stack cards vertically in each column with spacing
                    return 80 + (index * 120); // 80px top margin, 120px between cards
                  }
                };
                
                const isTop = isTopCard(independentResponse);
                const posX = (independentResponse.positionX && independentResponse.positionX !== 0) 
                  ? independentResponse.positionX 
                  : getStablePosition(independentResponse.id, 'x', independentResponse.category);
                const posY = (independentResponse.positionY && independentResponse.positionY !== 0) 
                  ? independentResponse.positionY 
                  : getStablePosition(independentResponse.id, 'y', independentResponse.category);
                
                // Check if this card is being hovered over during drag
                const isHoveredOver = hoveringOverCard === independentResponse.id;
                const isDragging = activeId === independentResponse.id;
                
                return (
                  <div
                    key={`card-${response.id}`} // Simpler unique key
                    style={{
                      position: 'absolute',
                      left: posX,
                      top: posY,
                      zIndex: activeId === independentResponse.id ? 100 : (isTop ? 10 : 1),
                      transform: isHoveredOver && !isDragging ? 'scale(0.9)' : 'scale(1)',
                      transition: 'transform 0.2s ease-in-out',
                    }}
                  >
                    <ResponseCard 
                      response={independentResponse} 
                      onDoubleClick={() => handleDoubleClick(independentResponse.id)}
                      isTopCard={isTop}
                    />
                  </div>
                );
              })}

              {/* Group boundaries removed to clean up interface */}
            </div>
          </div>

          <DragOverlay>
            {activeId && draggedResponse ? (
              <ResponseCard response={draggedResponse} isDragging />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}