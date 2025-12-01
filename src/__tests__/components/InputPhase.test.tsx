import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InputPhase from '@/components/phases/InputPhase';
import { createMockSession, createMockParticipant, mockSocketService } from '../utils/testHelpers';
import type { Session, Participant } from '@/lib/api';

// Mock the socket service
jest.mock('@/lib/socket', () => ({
  socketService: mockSocketService,
}));

describe('InputPhase Component', () => {
  let mockSession: Session;
  let mockParticipant: Participant;
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    mockSession = createMockSession({
      phase: 'INPUT',
      title: 'Test Retrospective',
    });

    mockParticipant = createMockParticipant({
      id: 'test-participant',
      displayName: 'Test User',
      isHost: false,
    });

    user = userEvent.setup();
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    test('should render input phase interface correctly', () => {
      render(
        <InputPhase
          session={mockSession}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      expect(screen.getByText('💭 Share Your Thoughts')).toBeInTheDocument();
      expect(screen.getByText('Test Retrospective')).toBeInTheDocument();
      expect(screen.getByText('What went well?')).toBeInTheDocument();
      expect(screen.getByText('What didn\'t go well?')).toBeInTheDocument();
    });

    test('should show different UI for host vs participant', () => {
      const hostParticipant = createMockParticipant({ isHost: true });
      
      const { rerender } = render(
        <InputPhase
          session={mockSession}
          participant={hostParticipant}
          isConnected={true}
        />
      );

      // Host should see additional controls
      expect(screen.getByText('Next Phase')).toBeInTheDocument();

      // Re-render as regular participant
      rerender(
        <InputPhase
          session={mockSession}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      // Regular participant should not see phase controls
      expect(screen.queryByText('Next Phase')).not.toBeInTheDocument();
    });

    test('should display timer when configured', () => {
      const sessionWithTimer = createMockSession({
        phase: 'INPUT',
        settings: { inputTimer: 300 }, // 5 minutes
      });

      render(
        <InputPhase
          session={sessionWithTimer}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      // Timer component should be rendered
      expect(screen.getByText(/timer/i)).toBeInTheDocument();
    });
  });

  describe('Response Creation', () => {
    test('should allow user to add positive response', async () => {
      render(
        <InputPhase
          session={mockSession}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      const positiveInput = screen.getByPlaceholderText(/what went well/i);
      const addButton = screen.getAllByText('Add')[0]; // First Add button (positive)

      await user.type(positiveInput, 'Great teamwork this sprint');
      await user.click(addButton);

      expect(mockSocketService.emit).toHaveBeenCalledWith('add_response', {
        sessionId: mockSession.id,
        participantId: mockParticipant.id,
        content: 'Great teamwork this sprint',
        category: 'WENT_WELL',
      });
    });

    test('should allow user to add negative response', async () => {
      render(
        <InputPhase
          session={mockSession}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      const negativeInput = screen.getByPlaceholderText(/what didn't go well/i);
      const addButtons = screen.getAllByText('Add');
      const negativeAddButton = addButtons[1]; // Second Add button (negative)

      await user.type(negativeInput, 'Communication issues');
      await user.click(negativeAddButton);

      expect(mockSocketService.emit).toHaveBeenCalledWith('add_response', {
        sessionId: mockSession.id,
        participantId: mockParticipant.id,
        content: 'Communication issues',
        category: 'DIDNT_GO_WELL',
      });
    });

    test('should prevent adding empty responses', async () => {
      render(
        <InputPhase
          session={mockSession}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      const addButton = screen.getAllByText('Add')[0];
      await user.click(addButton);

      // Should not emit if content is empty
      expect(mockSocketService.emit).not.toHaveBeenCalled();
    });

    test('should clear input after successful response addition', async () => {
      render(
        <InputPhase
          session={mockSession}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      const positiveInput = screen.getByPlaceholderText(/what went well/i) as HTMLInputElement;
      const addButton = screen.getAllByText('Add')[0];

      await user.type(positiveInput, 'Test response');
      await user.click(addButton);

      expect(positiveInput.value).toBe('');
    });
  });

  describe('Response Management', () => {
    test('should display existing responses', () => {
      const sessionWithResponses = createMockSession({
        phase: 'INPUT',
        responses: [
          {
            id: 'response-1',
            participantId: mockParticipant.id,
            content: 'Existing positive response',
            category: 'WENT_WELL',
            participant: mockParticipant,
          },
          {
            id: 'response-2',
            participantId: mockParticipant.id,
            content: 'Existing negative response',
            category: 'DIDNT_GO_WELL',
            participant: mockParticipant,
          },
        ],
      });

      render(
        <InputPhase
          session={sessionWithResponses}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      expect(screen.getByText('Existing positive response')).toBeInTheDocument();
      expect(screen.getByText('Existing negative response')).toBeInTheDocument();
    });

    test('should allow editing own responses', async () => {
      const sessionWithResponses = createMockSession({
        phase: 'INPUT',
        responses: [
          {
            id: 'response-1',
            participantId: mockParticipant.id,
            content: 'Original content',
            category: 'WENT_WELL',
            participant: mockParticipant,
          },
        ],
      });

      render(
        <InputPhase
          session={sessionWithResponses}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      const editButton = screen.getByText('✏️');
      await user.click(editButton);

      const editInput = screen.getByDisplayValue('Original content');
      await user.clear(editInput);
      await user.type(editInput, 'Updated content');

      const saveButton = screen.getByText('💾');
      await user.click(saveButton);

      expect(mockSocketService.emit).toHaveBeenCalledWith('update_response', {
        sessionId: mockSession.id,
        responseId: 'response-1',
        content: 'Updated content',
        category: 'WENT_WELL',
      });
    });

    test('should allow deleting own responses', async () => {
      const sessionWithResponses = createMockSession({
        phase: 'INPUT',
        responses: [
          {
            id: 'response-1',
            participantId: mockParticipant.id,
            content: 'Response to delete',
            category: 'WENT_WELL',
            participant: mockParticipant,
          },
        ],
      });

      render(
        <InputPhase
          session={sessionWithResponses}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      const deleteButton = screen.getByText('🗑️');
      await user.click(deleteButton);

      expect(mockSocketService.emit).toHaveBeenCalledWith('delete_response', {
        sessionId: mockSession.id,
        responseId: 'response-1',
      });
    });

    test('should not allow editing others\' responses', () => {
      const otherParticipant = createMockParticipant({
        id: 'other-participant',
        displayName: 'Other User',
      });

      const sessionWithResponses = createMockSession({
        phase: 'INPUT',
        responses: [
          {
            id: 'response-1',
            participantId: otherParticipant.id,
            content: 'Someone else\'s response',
            category: 'WENT_WELL',
            participant: otherParticipant,
          },
        ],
      });

      render(
        <InputPhase
          session={sessionWithResponses}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      // Should not show edit/delete buttons for other participants' responses
      expect(screen.queryByText('✏️')).not.toBeInTheDocument();
      expect(screen.queryByText('🗑️')).not.toBeInTheDocument();
    });
  });

  describe('Real-time Features', () => {
    test('should emit typing indicators', async () => {
      render(
        <InputPhase
          session={mockSession}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      const positiveInput = screen.getByPlaceholderText(/what went well/i);
      
      await user.click(positiveInput);
      await user.type(positiveInput, 'A');

      // Should emit typing start when user starts typing
      expect(mockSocketService.emit).toHaveBeenCalledWith('typing_start', {
        sessionId: mockSession.id,
        participantId: mockParticipant.id,
      });
    });

    test('should setup socket event listeners', () => {
      render(
        <InputPhase
          session={mockSession}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      // Verify that socket event listeners are set up
      expect(mockSocketService.on).toHaveBeenCalledWith('response_added', expect.any(Function));
      expect(mockSocketService.on).toHaveBeenCalledWith('response_updated', expect.any(Function));
      expect(mockSocketService.on).toHaveBeenCalledWith('response_deleted', expect.any(Function));
    });

    test('should handle disconnected state', () => {
      render(
        <InputPhase
          session={mockSession}
          participant={mockParticipant}
          isConnected={false}
        />
      );

      // Should show disconnected state
      expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
      
      // Add buttons should be disabled
      const addButtons = screen.getAllByText('Add');
      addButtons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('Multi-User Scenarios', () => {
    test('should handle multiple users adding responses simultaneously', async () => {
      const { rerender } = render(
        <InputPhase
          session={mockSession}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      // Simulate receiving responses from other participants via socket events
      const socketCallback = mockSocketService.on.mock.calls
        .find(call => call[0] === 'response_added')?.[1];

      if (socketCallback) {
        // Simulate rapid response additions from different users
        const responses = [
          {
            id: 'response-1',
            participantId: 'user-1',
            content: 'Response from user 1',
            category: 'WENT_WELL',
            participant: { displayName: 'User 1', avatarId: '🐯' },
          },
          {
            id: 'response-2',
            participantId: 'user-2',
            content: 'Response from user 2',
            category: 'DIDNT_GO_WELL',
            participant: { displayName: 'User 2', avatarId: '🦊' },
          },
          {
            id: 'response-3',
            participantId: 'user-3',
            content: 'Response from user 3',
            category: 'WENT_WELL',
            participant: { displayName: 'User 3', avatarId: '🐺' },
          },
        ];

        // Simulate receiving these responses
        responses.forEach(response => {
          socketCallback(response);
        });

        // Update session with new responses
        const updatedSession = {
          ...mockSession,
          responses: responses,
        };

        rerender(
          <InputPhase
            session={updatedSession}
            participant={mockParticipant}
            isConnected={true}
          />
        );

        // All responses should be displayed
        responses.forEach(response => {
          expect(screen.getByText(response.content)).toBeInTheDocument();
        });
      }
    });

    test('should display participant avatars and names correctly', () => {
      const sessionWithMultipleResponses = createMockSession({
        phase: 'INPUT',
        responses: [
          {
            id: 'response-1',
            participantId: 'user-1',
            content: 'Response 1',
            category: 'WENT_WELL',
            participant: { displayName: 'Alice', avatarId: '🦁' },
          },
          {
            id: 'response-2',
            participantId: 'user-2',
            content: 'Response 2',
            category: 'DIDNT_GO_WELL',
            participant: { displayName: 'Bob', avatarId: '🐯' },
          },
        ],
      });

      render(
        <InputPhase
          session={sessionWithMultipleResponses}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      expect(screen.getByText('🦁')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('🐯')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    test('should handle typing indicators from multiple users', () => {
      const hostParticipant = createMockParticipant({ isHost: true });
      
      render(
        <InputPhase
          session={mockSession}
          participant={hostParticipant}
          isConnected={true}
        />
      );

      // Verify typing indicator listener is set up (for hosts)
      expect(mockSocketService.on).toHaveBeenCalledWith('participant_typing_start', expect.any(Function));
      expect(mockSocketService.on).toHaveBeenCalledWith('participant_typing_stop', expect.any(Function));
    });
  });

  describe('Host Controls', () => {
    test('should allow host to advance to next phase', async () => {
      const hostParticipant = createMockParticipant({ isHost: true });
      
      render(
        <InputPhase
          session={mockSession}
          participant={hostParticipant}
          isConnected={true}
        />
      );

      const nextPhaseButton = screen.getByText('Next Phase');
      await user.click(nextPhaseButton);

      expect(mockSocketService.emit).toHaveBeenCalledWith('change_phase', {
        sessionId: mockSession.id,
        phase: 'GROUPING',
      });
    });

    test('should allow host to go back to setup phase', async () => {
      const hostParticipant = createMockParticipant({ isHost: true });
      
      render(
        <InputPhase
          session={mockSession}
          participant={hostParticipant}
          isConnected={true}
        />
      );

      const backButton = screen.getByText('← Back to Setup');
      await user.click(backButton);

      expect(mockSocketService.emit).toHaveBeenCalledWith('change_phase', {
        sessionId: mockSession.id,
        phase: 'SETUP',
      });
    });

    test('should show typing indicators to host', async () => {
      const hostParticipant = createMockParticipant({ isHost: true });
      
      render(
        <InputPhase
          session={mockSession}
          participant={hostParticipant}
          isConnected={true}
        />
      );

      // Find the typing indicator socket callback
      const typingStartCallback = mockSocketService.on.mock.calls
        .find(call => call[0] === 'participant_typing_start')?.[1];

      if (typingStartCallback) {
        // Simulate someone typing
        typingStartCallback({
          participantId: 'user-1',
          participant: { displayName: 'Alice', avatarId: '🦁' },
        });

        // Should show typing indicator
        await waitFor(() => {
          expect(screen.getByText(/Alice is typing/i)).toBeInTheDocument();
        });
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      // Mock console.error to avoid noise in test output
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      render(
        <InputPhase
          session={mockSession}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      const positiveInput = screen.getByPlaceholderText(/what went well/i);
      const addButton = screen.getAllByText('Add')[0];

      await user.type(positiveInput, 'Test response');
      await user.click(addButton);

      // Simulate socket error
      const errorCallback = mockSocketService.on.mock.calls
        .find(call => call[0] === 'error')?.[1];

      if (errorCallback) {
        errorCallback({ message: 'Failed to add response' });
        
        // Should handle error gracefully
        await waitFor(() => {
          expect(screen.getByText(/error/i)).toBeInTheDocument();
        });
      }

      consoleSpy.mockRestore();
    });

    test('should validate response length', async () => {
      render(
        <InputPhase
          session={mockSession}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      const positiveInput = screen.getByPlaceholderText(/what went well/i);
      const addButton = screen.getAllByText('Add')[0];

      // Try to add very long response
      const longText = 'a'.repeat(1000);
      await user.type(positiveInput, longText);
      await user.click(addButton);

      // Should not emit if content is too long
      expect(mockSocketService.emit).not.toHaveBeenCalled();
      
      // Should show validation error
      expect(screen.getByText(/too long/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA labels and roles', () => {
      render(
        <InputPhase
          session={mockSession}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      // Check for proper form labels
      expect(screen.getByLabelText(/what went well/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/what didn't go well/i)).toBeInTheDocument();

      // Check for button accessibility
      const addButtons = screen.getAllByRole('button', { name: /add/i });
      expect(addButtons).toHaveLength(2);
    });

    test('should support keyboard navigation', async () => {
      render(
        <InputPhase
          session={mockSession}
          participant={mockParticipant}
          isConnected={true}
        />
      );

      const positiveInput = screen.getByPlaceholderText(/what went well/i);
      
      // Focus should work
      positiveInput.focus();
      expect(positiveInput).toHaveFocus();

      // Enter key should submit
      await user.type(positiveInput, 'Test response{enter}');
      
      expect(mockSocketService.emit).toHaveBeenCalledWith('add_response', {
        sessionId: mockSession.id,
        participantId: mockParticipant.id,
        content: 'Test response',
        category: 'WENT_WELL',
      });
    });
  });
});