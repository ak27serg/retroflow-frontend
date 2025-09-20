'use client';

import { useState, useEffect } from 'react';
import { Session, Participant, Response } from '@/lib/api';
import { socketService } from '@/lib/socket';

interface GroupingPhaseProps {
  session: Session;
  participant: Participant;
  isConnected: boolean;
}

interface ResponseCardProps {
  response: Response;
}

function ResponseCard({ response }: ResponseCardProps) {
  return (
    <div
      className={`p-3 rounded-lg border-2 shadow-sm transition-all duration-200 w-48 relative ${
        response.category === 'WENT_WELL'
          ? 'bg-green-50 border-green-300'
          : 'bg-red-50 border-red-300'
      }`}
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
      </div>
    </div>
  );
}


export default function GroupingPhase({ session, participant, isConnected }: GroupingPhaseProps) {
  const [responses, setResponses] = useState<Response[]>([]);




  useEffect(() => {
    // Initialize with session data if available
    if (session.responses) {
      setResponses(session.responses);
    }
  }, [session.responses]);




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
        <div className="bg-white rounded-xl border-2 border-gray-300 min-h-[600px] p-6">
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center gap-2">
                😊 What went well?
              </h3>
              <div className="space-y-4">
                {responses.filter(r => r.category === 'WENT_WELL').map((response) => (
                  <ResponseCard key={response.id} response={response} />
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-red-800 mb-4 flex items-center gap-2">
                😕 What didn&apos;t go well?
              </h3>
              <div className="space-y-4">
                {responses.filter(r => r.category === 'DIDNT_GO_WELL').map((response) => (
                  <ResponseCard key={response.id} response={response} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}