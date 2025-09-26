'use client';

import { useState, useEffect, useCallback } from 'react';
import { Session, Participant, Group, Response, Connection } from '@/lib/api';
import { socketService } from '@/lib/socket';

interface ResultsPhaseProps {
  session: Session;
  participant: Participant;
  isConnected: boolean;
}

export default function ResultsPhase({ session, participant }: ResultsPhaseProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [showActionItems, setShowActionItems] = useState(false);
  const [actionItems, setActionItems] = useState<string[]>([]);
  const [newActionItem, setNewActionItem] = useState('');
  const [presentationMode, setPresentationMode] = useState(false);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [isInPresentation, setIsInPresentation] = useState(false);

  // Function to build connected groups from responses and connections (for results without voting)
  const buildConnectedGroupsForResults = useCallback((responses: Response[], connections: Connection[], sessionId: string): Group[] => {
    console.log('Building connected groups for results from:', { 
      responsesCount: responses.length, 
      connectionsCount: connections.length 
    });

    // Create adjacency map for connections
    const adjacencyMap = new Map<string, Set<string>>();
    
    // Initialize each response as its own node
    responses.forEach(response => {
      adjacencyMap.set(response.id, new Set());
    });
    
    // Add connections to adjacency map (bidirectional)
    connections.forEach(connection => {
      const fromSet = adjacencyMap.get(connection.fromResponseId);
      const toSet = adjacencyMap.get(connection.toResponseId);
      
      if (fromSet) fromSet.add(connection.toResponseId);
      if (toSet) toSet.add(connection.fromResponseId);
    });
    
    // Find connected components using DFS
    const visited = new Set<string>();
    const resultGroups: Group[] = [];
    
    const findConnectedGroup = (responseId: string): string[] => {
      const group: string[] = [];
      const stack = [responseId];
      
      while (stack.length > 0) {
        const currentId = stack.pop()!;
        if (visited.has(currentId)) continue;
        
        visited.add(currentId);
        group.push(currentId);
        
        const neighbors = adjacencyMap.get(currentId);
        if (neighbors) {
          neighbors.forEach(neighborId => {
            if (!visited.has(neighborId)) {
              stack.push(neighborId);
            }
          });
        }
      }
      
      return group;
    };
    
    // Process each response to find its connected group
    responses.forEach(response => {
      if (!visited.has(response.id)) {
        const connectedResponseIds = findConnectedGroup(response.id);
        const connectedResponses = connectedResponseIds
          .map(id => responses.find(r => r.id === id))
          .filter(Boolean) as Response[];
        
        if (connectedResponses.length > 0) {
          // Create a group for connected responses
          if (connectedResponses.length > 1) {
            // Multiple connected responses - create merged group
            const combinedContent = connectedResponses.map(r => r.content).join(' • ');
            const avgX = connectedResponses.reduce((sum, r) => sum + (r.positionX || 0), 0) / connectedResponses.length;
            const avgY = connectedResponses.reduce((sum, r) => sum + (r.positionY || 0), 0) / connectedResponses.length;
            
            resultGroups.push({
              id: `connected-${connectedResponseIds.sort().join('--')}`,
              sessionId,
              label: combinedContent.length > 60 
                ? combinedContent.substring(0, 60) + '...'
                : combinedContent,
              color: connectedResponses[0].category === 'WENT_WELL' ? '#10b981' : '#ef4444',
              positionX: avgX,
              positionY: avgY,
              voteCount: 0, // No votes cast
              createdAt: connectedResponses[0].createdAt,
              responses: connectedResponses
            });
          } else {
            // Single response - create individual group
            const response = connectedResponses[0];
            resultGroups.push({
              id: `individual-${response.id}`,
              sessionId,
              label: response.content.length > 30 
                ? response.content.substring(0, 30) + '...'
                : response.content,
              color: response.category === 'WENT_WELL' ? '#10b981' : '#ef4444',
              positionX: response.positionX || 0,
              positionY: response.positionY || 0,
              voteCount: 0, // No votes cast
              createdAt: response.createdAt,
              responses: [response]
            });
          }
        }
      }
    });
    
    console.log('Built result groups:', resultGroups.length);
    return resultGroups;
  }, []);

  useEffect(() => {
    // Listen for presentation mode events
    const socket = socketService.getSocket();
    console.log('ResultsPhase: Setting up presentation event listeners, socket:', !!socket);
    if (!socket) return;

    const handlePresentationStart = () => {
      console.log('Presentation started event received');
      setIsInPresentation(true);
      setCurrentItemIndex(0);
    };

    const handlePresentationEnd = () => {
      console.log('Presentation ended event received');
      setIsInPresentation(false);
      setCurrentItemIndex(0);
    };

    const handlePresentationNavigate = (data: { itemIndex: number }) => {
      console.log('Presentation navigate event received:', data.itemIndex);
      setCurrentItemIndex(data.itemIndex);
    };

    socket.on('presentation_started', handlePresentationStart);
    socket.on('presentation_ended', handlePresentationEnd);
    socket.on('presentation_navigate', handlePresentationNavigate);

    return () => {
      socket.off('presentation_started', handlePresentationStart);
      socket.off('presentation_ended', handlePresentationEnd);
      socket.off('presentation_navigate', handlePresentationNavigate);
    };
  }, []);

  useEffect(() => {
    console.log('ResultsPhase: Processing session data', {
      sessionGroups: session.groups,
      sessionVotes: session.votes,
      sessionResponses: session.responses
    });
    
    const allGroups: Group[] = [];
    
    // Add all existing groups (including those created for voting)
    if (session.groups && session.groups.length > 0) {
      session.groups.forEach(group => {
        console.log('Processing group:', {
          id: group.id,
          label: group.label,
          voteCount: group.voteCount,
          responsesCount: group.responses?.length || 0
        });
        
        // Include all groups that have responses (regardless of vote count)
        if (group.responses && group.responses.length > 0) {
          allGroups.push(group);
        }
      });
    }
    
    // If no groups exist yet (no voting happened), create groups from ungrouped responses
    // This handles the case where user goes straight from grouping/input to results without voting
    if (allGroups.length === 0 && session.responses && session.responses.length > 0) {
      console.log('No voted groups found, creating groups from responses');
      
      // Get ungrouped responses
      const ungroupedResponses = session.responses.filter(response => !response.groupId);
      
      // Use the same logic as VotingPhase to build connected groups
      const connections = session.connections || [];
      const builtGroups = buildConnectedGroupsForResults(ungroupedResponses, connections, session.id);
      
      allGroups.push(...builtGroups);
    }
    
    console.log('All groups to display:', allGroups);
    
    // Sort groups by vote count (highest first), then by number of responses for 0-vote items
    const sortedGroups = allGroups.sort((a, b) => {
      if (a.voteCount !== b.voteCount) {
        return b.voteCount - a.voteCount; // Higher votes first
      }
      // For equal vote counts, sort by number of responses
      return (b.responses?.length || 0) - (a.responses?.length || 0);
    });
    
    console.log('Final sorted groups:', sortedGroups);
    setGroups(sortedGroups);
  }, [session.groups, session.responses, session.votes, session.connections, session.id, buildConnectedGroupsForResults]);

  const addActionItem = () => {
    if (newActionItem.trim()) {
      setActionItems(prev => [...prev, newActionItem.trim()]);
      setNewActionItem('');
    }
  };

  const removeActionItem = (index: number) => {
    setActionItems(prev => prev.filter((_, i) => i !== index));
  };

  const exportResults = () => {
    const results = {
      sessionTitle: session.title,
      date: new Date().toISOString().split('T')[0],
      participants: session.participants?.map(p => ({
        name: p.displayName,
        avatar: p.avatarId
      })),
      groupsByPriority: groups.map((group, index) => ({
        rank: index + 1,
        title: group.label || 'Unnamed Group',
        votes: group.voteCount,
        items: group.responses?.map(r => ({
          content: r.content,
          category: r.category,
          author: r.participant?.displayName
        })) || []
      })),
      actionItems
    };

    const dataStr = JSON.stringify(results, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `retroflow-results-${session.title.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const startNewRetro = () => {
    window.location.href = '/';
  };

  const startPresentation = () => {
    if (!participant.isHost) return;
    console.log('Host starting presentation, emitting start_presentation event');
    setPresentationMode(true);
    setIsInPresentation(true);
    setCurrentItemIndex(0);
    // Broadcast to all participants
    socketService.emit('start_presentation', { sessionId: session.id });
  };

  const exitPresentation = () => {
    if (!participant.isHost) return;
    setPresentationMode(false);
    setIsInPresentation(false);
    setCurrentItemIndex(0);
    // Broadcast to all participants
    socketService.emit('end_presentation', { sessionId: session.id });
  };

  const nextItem = useCallback(() => {
    if (!participant.isHost) return;
    if (currentItemIndex < groups.length - 1) {
      const newIndex = currentItemIndex + 1;
      setCurrentItemIndex(newIndex);
      // Broadcast navigation to all participants
      socketService.emit('navigate_presentation', { sessionId: session.id, itemIndex: newIndex });
    }
  }, [currentItemIndex, groups.length, participant.isHost, session.id]);

  const prevItem = useCallback(() => {
    if (!participant.isHost) return;
    if (currentItemIndex > 0) {
      const newIndex = currentItemIndex - 1;
      setCurrentItemIndex(newIndex);
      // Broadcast navigation to all participants
      socketService.emit('navigate_presentation', { sessionId: session.id, itemIndex: newIndex });
    }
  }, [currentItemIndex, participant.isHost, session.id]);

  const goToItem = (index: number) => {
    if (!participant.isHost) return;
    setCurrentItemIndex(index);
    // Broadcast navigation to all participants
    socketService.emit('navigate_presentation', { sessionId: session.id, itemIndex: index });
  };

  // Handle keyboard navigation (host only)
  useEffect(() => {
    if (!isInPresentation || !participant.isHost) return;

    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === ' ') {
        nextItem();
      } else if (event.key === 'ArrowLeft') {
        prevItem();
      } else if (event.key === 'Escape') {
        exitPresentation();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isInPresentation, participant.isHost, nextItem, prevItem]); // eslint-disable-line react-hooks/exhaustive-deps

  const getMedal = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}.`;
  };

  const totalResponses = groups.reduce((sum, group) => sum + (group.responses?.length || 0), 0);
  const totalVotes = groups.reduce((sum, group) => sum + group.voteCount, 0);
  const participantCount = session.participants?.length || 0;

  // Presentation Mode View - visible to all participants
  if (presentationMode || isInPresentation) {
    const currentItem = groups[currentItemIndex];
    if (!currentItem) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center text-white">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">No Results to Display</h1>
            {participant.isHost && (
              <button
                onClick={exitPresentation}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold"
              >
                Back to Summary
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-700 text-white flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6">
          <div className="flex items-center gap-4">
            {participant.isHost && (
              <button
                onClick={exitPresentation}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold"
              >
                ← Back to Summary
              </button>
            )}
            <span className="text-lg">
              {currentItemIndex + 1} of {groups.length}
            </span>
          </div>
          
          <h1 className="text-2xl font-bold">{session.title}</h1>
          
          <div className="flex items-center gap-2">
            {participant.isHost && (
              <>
                <span className="text-sm text-gray-300">Use ← → keys or</span>
                <div className="flex gap-1">
                  <button
                    onClick={prevItem}
                    disabled={currentItemIndex === 0}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded disabled:opacity-50"
                  >
                    ←
                  </button>
                  <button
                    onClick={nextItem}
                    disabled={currentItemIndex === groups.length - 1}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded disabled:opacity-50"
                  >
                    →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center p-12">
          <div className="max-w-4xl w-full text-center">
            {/* Ranking */}
            <div className="mb-8">
              <div className="text-6xl mb-4">{getMedal(currentItemIndex)}</div>
              <div className="text-3xl font-bold text-yellow-400 mb-2">
                Rank #{currentItemIndex + 1}
              </div>
              <div className="text-6xl font-bold text-white mb-4">
                {currentItem.voteCount} {currentItem.voteCount === 1 ? 'Vote' : 'Votes'}
              </div>
            </div>

            {/* Group/Item Details */}
            <div className="bg-white/10 backdrop-blur rounded-2xl p-8 mb-8">
              <h2 className="text-3xl font-bold text-white mb-6">
                {currentItem.label || 'Unnamed Item'}
              </h2>
              
              {/* Responses */}
              <div className="grid md:grid-cols-2 gap-4">
                {currentItem.responses?.map((response, index) => (
                  <div
                    key={response.id || index}
                    className={`p-4 rounded-xl text-left ${
                      response.category === 'WENT_WELL'
                        ? 'bg-green-500/20 border border-green-400'
                        : 'bg-red-500/20 border border-red-400'
                    }`}
                  >
                    <p className="text-white text-lg mb-3">{response.content}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <span>{response.participant?.avatarId}</span>
                      <span>{response.participant?.displayName}</span>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        response.category === 'WENT_WELL'
                          ? 'bg-green-500 text-white'
                          : 'bg-red-500 text-white'
                      }`}>
                        {response.category === 'WENT_WELL' ? '😊 Went Well' : '😕 Needs Work'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Progress Dots */}
            <div className="flex justify-center gap-2">
              {groups.map((_, index) => (
                participant.isHost ? (
                  <button
                    key={index}
                    onClick={() => goToItem(index)}
                    className={`w-3 h-3 rounded-full transition-colors ${
                      index === currentItemIndex
                        ? 'bg-white'
                        : 'bg-white/30 hover:bg-white/50'
                    }`}
                  />
                ) : (
                  <div
                    key={index}
                    className={`w-3 h-3 rounded-full transition-colors ${
                      index === currentItemIndex
                        ? 'bg-white'
                        : 'bg-white/30'
                    }`}
                  />
                )
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Summary View (Original)
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">🎉 Retrospective Results</h1>
        <p className="text-xl text-gray-600 mb-4">{session.title}</p>
        
        {/* Stats */}
        <div className="flex justify-center gap-8 mb-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{participantCount}</div>
            <div className="text-sm text-gray-500">Participants</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{totalResponses}</div>
            <div className="text-sm text-gray-500">Responses</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{totalVotes}</div>
            <div className="text-sm text-gray-500">Total Votes</div>
          </div>
        </div>

        {/* Action buttons - Host only */}
        {participant.isHost && (
          <div className="flex justify-center gap-4 mb-4">
            <button
              onClick={startPresentation}
              className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 font-semibold"
            >
              📽️ Start Presentation
            </button>
            <button
              onClick={() => setShowActionItems(!showActionItems)}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold"
            >
              {showActionItems ? 'Hide' : 'Show'} Action Items
            </button>
            <button
              onClick={exportResults}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-semibold"
            >
              Export Results
            </button>
            <button
              onClick={startNewRetro}
              className="bg-purple-600 text-white px-6 py-3 rounded-lg hover:bg-purple-700 font-semibold"
            >
              New Retro
            </button>
          </div>
        )}


        {/* Host navigation */}
        {participant.isHost && (
          <div className="flex justify-center">
            <button
              onClick={() => socketService.emit('change_phase', { sessionId: session.id, phase: 'VOTING' })}
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center gap-2"
            >
              ← Back to Voting
            </button>
          </div>
        )}
      </div>

      {/* Action Items Section */}
      {showActionItems && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-8">
          <h3 className="text-xl font-semibold text-yellow-800 mb-4">📋 Action Items</h3>
          
          <div className="space-y-3 mb-4">
            {actionItems.map((item, index) => (
              <div key={index} className="flex items-center gap-3 bg-white p-3 rounded-lg">
                <span className="text-yellow-600 font-semibold">{index + 1}.</span>
                <span className="flex-1 text-gray-800">{item}</span>
                {participant.isHost && (
                  <button
                    onClick={() => removeActionItem(index)}
                    className="text-red-500 hover:text-red-700 p-1"
                    title="Remove action item"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {participant.isHost && (
            <div className="flex gap-3">
              <input
                type="text"
                value={newActionItem}
                onChange={(e) => setNewActionItem(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addActionItem()}
                placeholder="Add an action item..."
                className="flex-1 px-4 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-gray-900 placeholder-gray-700"
              />
              <button
                onClick={addActionItem}
                disabled={!newActionItem.trim()}
                className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      <div className="max-w-4xl mx-auto">
        {groups.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Results Yet</h3>
            <p className="text-gray-600">Complete the voting phase to see prioritized results.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group, index) => (
              <div
                key={group.id}
                className={`bg-white rounded-xl border-2 p-6 ${
                  index === 0 
                    ? 'border-yellow-400 bg-gradient-to-r from-yellow-50 to-white' 
                    : index === 1
                    ? 'border-gray-400 bg-gradient-to-r from-gray-50 to-white'
                    : index === 2
                    ? 'border-orange-400 bg-gradient-to-r from-orange-50 to-white'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getMedal(index)}</span>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        {group.label || 'Unnamed Group'}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {group.responses?.length || 0} responses
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-3xl font-bold text-purple-600">
                      {group.voteCount}
                    </div>
                    <div className="text-sm text-gray-500">votes</div>
                  </div>
                </div>

                {/* Group responses */}
                <div className="grid md:grid-cols-2 gap-4">
                  {group.responses?.map((response) => (
                    <div
                      key={response.id}
                      className={`p-3 rounded-lg border ${
                        response.category === 'WENT_WELL'
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <p className="text-sm text-gray-800 mb-2">{response.content}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{response.participant?.avatarId}</span>
                        <span>{response.participant?.displayName}</span>
                        <span className={`px-2 py-1 rounded-full ${
                          response.category === 'WENT_WELL'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {response.category === 'WENT_WELL' ? '😊 Went Well' : '😕 Needs Work'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center mt-12 pt-8 border-t border-gray-200">
        <p className="text-sm text-gray-500">
          Generated by RetroFlow • {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}