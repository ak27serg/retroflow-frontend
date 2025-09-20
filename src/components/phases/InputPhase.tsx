'use client';

import { useState, useEffect } from 'react';
import { Session, Participant, Response } from '@/lib/api';
import { socketService } from '@/lib/socket';
import Timer from '@/components/Timer';

interface InputPhaseProps {
  session: Session;
  participant: Participant;
  isConnected: boolean;
}

export default function InputPhase({ session, participant, isConnected }: InputPhaseProps) {
  const [wentWellText, setWentWellText] = useState('');
  const [didntGoWellText, setDidntGoWellText] = useState('');
  const [isSubmittingWentWell, setIsSubmittingWentWell] = useState(false);
  const [isSubmittingDidntGoWell, setIsSubmittingDidntGoWell] = useState(false);
  const [responses, setResponses] = useState<Response[]>([]);
  const [editingResponseId, setEditingResponseId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [typingParticipants, setTypingParticipants] = useState<Set<string>>(new Set());
  const [typingTimeouts, setTypingTimeouts] = useState<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    // Listen for response events
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleResponseAdded = (response: Response) => {
      setResponses(prev => [...prev, response]);
    };

    const handleResponseUpdated = (response: Response) => {
      setResponses(prev => prev.map(r => r.id === response.id ? response : r));
      setEditingResponseId(null);
    };

    const handleResponseDeleted = (data: { responseId: string }) => {
      setResponses(prev => prev.filter(r => r.id !== data.responseId));
    };

    const handleTypingStart = (data: { participantId: string }) => {
      console.log('Typing start received:', data.participantId);
      setTypingParticipants(prev => new Set(prev).add(data.participantId));
      
      // Clear existing timeout for this participant
      setTypingTimeouts(prev => {
        const existingTimeout = prev.get(data.participantId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
        
        // Set new timeout to remove typing indicator after 3 seconds
        const newTimeout = setTimeout(() => {
          console.log('Removing typing indicator for:', data.participantId);
          setTypingParticipants(current => {
            const newSet = new Set(current);
            newSet.delete(data.participantId);
            return newSet;
          });
          setTypingTimeouts(current => {
            const newMap = new Map(current);
            newMap.delete(data.participantId);
            return newMap;
          });
        }, 3000);
        
        const newMap = new Map(prev);
        newMap.set(data.participantId, newTimeout);
        return newMap;
      });
    };

    const handleTypingStop = (data: { participantId: string }) => {
      console.log('Typing stop received:', data.participantId);
      setTypingParticipants(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.participantId);
        return newSet;
      });
      
      setTypingTimeouts(prev => {
        const existingTimeout = prev.get(data.participantId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
        const newMap = new Map(prev);
        newMap.delete(data.participantId);
        return newMap;
      });
    };

    socket.on('response_added', handleResponseAdded);
    socket.on('response_updated', handleResponseUpdated);
    socket.on('response_deleted', handleResponseDeleted);
    socket.on('participant_typing_start', handleTypingStart);
    socket.on('participant_typing_stop', handleTypingStop);

    return () => {
      socket.off('response_added', handleResponseAdded);
      socket.off('response_updated', handleResponseUpdated);
      socket.off('response_deleted', handleResponseDeleted);
      socket.off('participant_typing_start', handleTypingStart);
      socket.off('participant_typing_stop', handleTypingStop);
      
      // Clear all timeouts on cleanup
      typingTimeouts.forEach(timeout => clearTimeout(timeout));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addResponse = async (category: 'WENT_WELL' | 'DIDNT_GO_WELL', content: string) => {
    if (!content.trim() || !isConnected) return;

    const isWentWell = category === 'WENT_WELL';
    const setIsSubmitting = isWentWell ? setIsSubmittingWentWell : setIsSubmittingDidntGoWell;
    const setText = isWentWell ? setWentWellText : setDidntGoWellText;

    setIsSubmitting(true);

    try {
      socketService.emit('add_response', {
        sessionId: session.id,
        participantId: participant.id,
        content: content.trim(),
        category
      });

      // Clear the text field on successful submission
      setText('');
    } catch (error) {
      console.error('Failed to add response:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const editResponse = (response: Response) => {
    setEditingResponseId(response.id);
    setEditText(response.content);
  };

  const saveEdit = () => {
    if (!editText.trim() || !editingResponseId) return;

    socketService.emit('update_response', {
      responseId: editingResponseId,
      content: editText.trim()
    });
  };

  const deleteResponse = (responseId: string) => {
    socketService.emit('delete_response', {
      responseId
    });
  };

  const cancelEdit = () => {
    setEditingResponseId(null);
    setEditText('');
  };

  const myResponses = responses.filter(r => r.participantId === participant.id);
  const wentWellResponses = myResponses.filter(r => r.category === 'WENT_WELL');
  const didntGoWellResponses = myResponses.filter(r => r.category === 'DIDNT_GO_WELL');
  const moveToGrouping = () => {
    socketService.emit('change_phase', {
      sessionId: session.id,
      phase: 'GROUPING',
      stopTimer: true // Stop any running timer when manually changing phases
    });
  };

  const handleTimerEnd = () => {
    // Auto-advance to grouping phase when timer ends
    if (participant.isHost) {
      moveToGrouping();
    }
  };

  const handleTextChange = (text: string, category: 'WENT_WELL' | 'DIDNT_GO_WELL') => {
    if (category === 'WENT_WELL') {
      setWentWellText(text);
    } else {
      setDidntGoWellText(text);
    }

    // Emit typing indicator
    if (text.trim()) {
      console.log('Emitting typing start for participant:', participant.id);
      socketService.emit('typing_start', {
        sessionId: session.id,
        participantId: participant.id
      });
    } else {
      console.log('Emitting typing stop for participant:', participant.id);
      socketService.emit('typing_stop', {
        sessionId: session.id,
        participantId: participant.id
      });
    }
  };

  const getTypingParticipants = () => {
    if (!participant.isHost) return [];
    
    const typing = Array.from(typingParticipants)
      .map(participantId => session.participants?.find(p => p.id === participantId))
      .filter(p => p && p.id !== participant.id); // Exclude host from typing list
    
    console.log('Current typing participants:', {
      typingParticipants: Array.from(typingParticipants),
      foundParticipants: typing,
      isHost: participant.isHost
    });
    
    return typing;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Input Phase</h1>
        <p className="text-gray-600">Share your thoughts privately - others can&apos;t see what you&apos;re typing</p>
        
        {/* Timer - visible to all participants */}
        {session.timerEndTime && (
          <div className="mt-6 flex justify-center">
            <Timer 
              endTime={session.timerEndTime} 
              onTimeUp={handleTimerEnd}
              className="max-w-sm"
            />
          </div>
        )}
        
        {participant.isHost && (
          <div className="mt-4">
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => socketService.emit('change_phase', { sessionId: session.id, phase: 'SETUP', stopTimer: true })}
                disabled={!isConnected}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2"
              >
                ← Back to Setup
              </button>
              <button
                onClick={moveToGrouping}
                disabled={!isConnected}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold flex items-center gap-2"
              >
                Move to Grouping →
              </button>
            </div>
          </div>
        )}
      </div>
      
      <div className="max-w-6xl mx-auto">
        <div className="flex gap-8 items-start">
          {/* Typing indicators - visible to host only */}
          {participant.isHost && (
            <div className="flex-shrink-0 w-64">
              {getTypingParticipants().length > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="animate-pulse text-blue-600">✍️</div>
                    <span className="text-sm text-blue-700">
                      {getTypingParticipants().map(p => `${p?.avatarId} ${p?.displayName}`).join(', ')} 
                      {getTypingParticipants().length === 1 ? 'is' : 'are'} typing...
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Main content grid */}
          <div className="flex-1 grid md:grid-cols-2 gap-8">
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-green-800 mb-4 flex items-center gap-2">
              😊 What went well? (boom)
            </h2>
            <textarea
              value={wentWellText}
              onChange={(e) => handleTextChange(e.target.value, 'WENT_WELL')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  addResponse('WENT_WELL', wentWellText);
                }
              }}
              placeholder="What worked well during this sprint? What should we keep doing? (Press Enter to submit, Shift+Enter for new line)"
              className="w-full h-40 p-4 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none text-gray-900 placeholder-gray-500"
            />
            <button 
              onClick={() => addResponse('WENT_WELL', wentWellText)}
              disabled={!wentWellText.trim() || !isConnected || isSubmittingWentWell}
              className="mt-3 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmittingWentWell ? 'Adding...' : 'Add Response'}
            </button>

            {/* Display my responses */}
            <div className="mt-4 space-y-2">
              {wentWellResponses.map((response) => (
                <div key={response.id} className="bg-white border border-green-300 rounded-lg p-3">
                  {editingResponseId === response.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => {
                          setEditText(e.target.value);
                          // Emit typing indicator for editing
                          if (e.target.value.trim()) {
                            socketService.emit('typing_start', {
                              sessionId: session.id,
                              participantId: participant.id
                            });
                          } else {
                            socketService.emit('typing_stop', {
                              sessionId: session.id,
                              participantId: participant.id
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            saveEdit();
                          }
                        }}
                        className="w-full p-2 border border-green-300 rounded text-gray-900 placeholder-gray-500 resize-none"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button 
                          onClick={saveEdit}
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                        >
                          Save
                        </button>
                        <button 
                          onClick={cancelEdit}
                          className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-start">
                      <p className="text-gray-800 flex-1">{response.content}</p>
                      <div className="flex gap-1 ml-2">
                        <button
                          onClick={() => editResponse(response)}
                          className="text-gray-500 hover:text-green-600 p-1"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => deleteResponse(response.id)}
                          className="text-gray-500 hover:text-red-600 p-1"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-red-800 mb-4 flex items-center gap-2">
              😕 What didn&apos;t go well? (doom)
            </h2>
            <textarea
              value={didntGoWellText}
              onChange={(e) => handleTextChange(e.target.value, 'DIDNT_GO_WELL')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  addResponse('DIDNT_GO_WELL', didntGoWellText);
                }
              }}
              placeholder="What challenges did we face? What should we improve or stop doing? (Press Enter to submit, Shift+Enter for new line)"
              className="w-full h-40 p-4 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none text-gray-900 placeholder-gray-500"
            />
            <button 
              onClick={() => addResponse('DIDNT_GO_WELL', didntGoWellText)}
              disabled={!didntGoWellText.trim() || !isConnected || isSubmittingDidntGoWell}
              className="mt-3 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmittingDidntGoWell ? 'Adding...' : 'Add Response'}
            </button>

            {/* Display my responses */}
            <div className="mt-4 space-y-2">
              {didntGoWellResponses.map((response) => (
                <div key={response.id} className="bg-white border border-red-300 rounded-lg p-3">
                  {editingResponseId === response.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => {
                          setEditText(e.target.value);
                          // Emit typing indicator for editing
                          if (e.target.value.trim()) {
                            socketService.emit('typing_start', {
                              sessionId: session.id,
                              participantId: participant.id
                            });
                          } else {
                            socketService.emit('typing_stop', {
                              sessionId: session.id,
                              participantId: participant.id
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            saveEdit();
                          }
                        }}
                        className="w-full p-2 border border-red-300 rounded text-gray-900 placeholder-gray-500 resize-none"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button 
                          onClick={saveEdit}
                          className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                        >
                          Save
                        </button>
                        <button 
                          onClick={cancelEdit}
                          className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between items-start">
                      <p className="text-gray-800 flex-1">{response.content}</p>
                      <div className="flex gap-1 ml-2">
                        <button
                          onClick={() => editResponse(response)}
                          className="text-gray-500 hover:text-red-600 p-1"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => deleteResponse(response.id)}
                          className="text-gray-500 hover:text-red-600 p-1"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}