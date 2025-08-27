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

    socket.on('response_added', handleResponseAdded);
    socket.on('response_updated', handleResponseUpdated);
    socket.on('response_deleted', handleResponseDeleted);

    return () => {
      socket.off('response_added', handleResponseAdded);
      socket.off('response_updated', handleResponseUpdated);
      socket.off('response_deleted', handleResponseDeleted);
    };
  }, []);

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
      
      <div className="max-w-4xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-green-800 mb-4 flex items-center gap-2">
              😊 What went well? (boom)
            </h2>
            <textarea
              value={wentWellText}
              onChange={(e) => setWentWellText(e.target.value)}
              placeholder="What worked well during this sprint? What should we keep doing?"
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
                        onChange={(e) => setEditText(e.target.value)}
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
              onChange={(e) => setDidntGoWellText(e.target.value)}
              placeholder="What challenges did we face? What should we improve or stop doing?"
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
                        onChange={(e) => setEditText(e.target.value)}
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
  );
}