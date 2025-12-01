import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResultsPhase from '@/components/phases/ResultsPhase';
import { createMockSession, createMultiUserSession, mockSocketService } from '../utils/testHelpers';

// Mock the socket service
jest.mock('@/lib/socket', () => ({
  socketService: mockSocketService,
}));

describe('ResultsPhase Component', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    jest.clearAllMocks();
  });

  describe('Results Display', () => {
    test('should display groups sorted by vote count', () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      expect(screen.getByText('🎉 Retrospective Results')).toBeInTheDocument();
      expect(screen.getByText('Team Collaboration')).toBeInTheDocument();
      expect(screen.getByText('Process Issues')).toBeInTheDocument();

      // Check vote counts are displayed
      expect(screen.getByText('5')).toBeInTheDocument(); // Team Collaboration votes
      expect(screen.getByText('3')).toBeInTheDocument(); // Process Issues votes
    });

    test('should only show groups with votes >= 1', () => {
      const session = createMultiUserSession();
      // Add a group with 0 votes
      session.groups.push({
        id: 'group-3',
        sessionId: session.id,
        label: 'No Votes Group',
        color: '#10b981',
        positionX: 100,
        positionY: 300,
        voteCount: 0,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        responses: [],
      });

      const host = session.participants.find(p => p.isHost)!;
      
      render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      // Should not display the group with 0 votes
      expect(screen.queryByText('No Votes Group')).not.toBeInTheDocument();
      
      // Should display groups with votes
      expect(screen.getByText('Team Collaboration')).toBeInTheDocument();
      expect(screen.getByText('Process Issues')).toBeInTheDocument();
    });

    test('should display ranking medals correctly', () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      // Check for ranking medals/numbers
      expect(screen.getByText('🥇')).toBeInTheDocument(); // First place
      expect(screen.getByText('🥈')).toBeInTheDocument(); // Second place
    });

    test('should show session statistics', () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      // Check for participant count
      expect(screen.getByText('4')).toBeInTheDocument(); // 4 participants
      
      // Check for response count
      expect(screen.getByText('4')).toBeInTheDocument(); // 4 responses
      
      // Check for total votes
      expect(screen.getByText('8')).toBeInTheDocument(); // Total votes (2+3+3)
    });

    test('should display individual responses within groups', () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      // Check that individual responses are shown
      expect(screen.getByText('Great teamwork this sprint')).toBeInTheDocument();
      expect(screen.getByText('Communication could improve')).toBeInTheDocument();
      expect(screen.getByText('Good code reviews')).toBeInTheDocument();
      expect(screen.getByText('Too many meetings')).toBeInTheDocument();
    });
  });

  describe('Host Controls', () => {
    test('should show host controls for session host', () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      expect(screen.getByText('📽️ Start Presentation')).toBeInTheDocument();
      expect(screen.getByText('Show Action Items')).toBeInTheDocument();
      expect(screen.getByText('Export Results')).toBeInTheDocument();
      expect(screen.getByText('New Retro')).toBeInTheDocument();
      expect(screen.getByText('← Back to Voting')).toBeInTheDocument();
    });

    test('should hide host controls for regular participants', () => {
      const session = createMultiUserSession();
      const participant = session.participants.find(p => !p.isHost)!;
      
      render(
        <ResultsPhase
          session={session}
          participant={participant}
          isConnected={true}
        />
      );

      expect(screen.queryByText('📽️ Start Presentation')).not.toBeInTheDocument();
      expect(screen.queryByText('Show Action Items')).not.toBeInTheDocument();
      expect(screen.queryByText('Export Results')).not.toBeInTheDocument();
      expect(screen.queryByText('New Retro')).not.toBeInTheDocument();
      expect(screen.queryByText('← Back to Voting')).not.toBeInTheDocument();
    });

    test('should start presentation when host clicks button', async () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      const presentationButton = screen.getByText('📽️ Start Presentation');
      await user.click(presentationButton);

      expect(mockSocketService.emit).toHaveBeenCalledWith('start_presentation', {
        sessionId: session.id,
      });
    });

    test('should allow phase navigation for host', async () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      const backButton = screen.getByText('← Back to Voting');
      await user.click(backButton);

      expect(mockSocketService.emit).toHaveBeenCalledWith('change_phase', {
        sessionId: session.id,
        phase: 'VOTING',
      });
    });
  });

  describe('Presentation Mode', () => {
    test('should enter presentation mode when started', async () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      const { rerender } = render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      // Simulate presentation start event
      const presentationStartCallback = mockSocketService.on.mock.calls
        .find(call => call[0] === 'presentation_started')?.[1];

      if (presentationStartCallback) {
        presentationStartCallback();

        // Re-render to reflect state change
        rerender(
          <ResultsPhase
            session={session}
            participant={host}
            isConnected={true}
          />
        );

        // Should show presentation mode UI
        await waitFor(() => {
          expect(screen.getByText('← Back to Summary')).toBeInTheDocument();
          expect(screen.getByText('1 of 2')).toBeInTheDocument(); // Navigation indicator
        });
      }
    });

    test('should show presentation controls for host in presentation mode', async () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      const { rerender } = render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      // Simulate presentation start
      const presentationStartCallback = mockSocketService.on.mock.calls
        .find(call => call[0] === 'presentation_started')?.[1];

      if (presentationStartCallback) {
        presentationStartCallback();

        rerender(
          <ResultsPhase
            session={session}
            participant={host}
            isConnected={true}
          />
        );

        await waitFor(() => {
          expect(screen.getByText('Use ← → keys or')).toBeInTheDocument();
          expect(screen.getByText('←')).toBeInTheDocument();
          expect(screen.getByText('→')).toBeInTheDocument();
        });
      }
    });

    test('should navigate through items in presentation mode', async () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      const { rerender } = render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      // Start presentation
      const presentationStartCallback = mockSocketService.on.mock.calls
        .find(call => call[0] === 'presentation_started')?.[1];

      if (presentationStartCallback) {
        presentationStartCallback();

        rerender(
          <ResultsPhase
            session={session}
            participant={host}
            isConnected={true}
          />
        );

        // Should show first item by default
        await waitFor(() => {
          expect(screen.getByText('Team Collaboration')).toBeInTheDocument();
          expect(screen.getByText('5 Votes')).toBeInTheDocument();
        });

        // Navigate to next item
        const nextButton = screen.getByText('→');
        await user.click(nextButton);

        expect(mockSocketService.emit).toHaveBeenCalledWith('navigate_presentation', {
          sessionId: session.id,
          itemIndex: 1,
        });
      }
    });

    test('should display progress dots in presentation mode', async () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      const { rerender } = render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      // Start presentation
      const presentationStartCallback = mockSocketService.on.mock.calls
        .find(call => call[0] === 'presentation_started')?.[1];

      if (presentationStartCallback) {
        presentationStartCallback();

        rerender(
          <ResultsPhase
            session={session}
            participant={host}
            isConnected={true}
          />
        );

        // Should show progress dots (2 groups = 2 dots)
        const progressDots = document.querySelectorAll('[class*="rounded-full"]');
        expect(progressDots.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('Action Items Management', () => {
    test('should toggle action items visibility', async () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      const actionItemsButton = screen.getByText('Show Action Items');
      await user.click(actionItemsButton);

      // Should show action items section
      await waitFor(() => {
        expect(screen.getByText('📋 Action Items')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Add an action item...')).toBeInTheDocument();
      });

      // Button text should change
      expect(screen.getByText('Hide Action Items')).toBeInTheDocument();
    });

    test('should add action items', async () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      // Open action items
      const actionItemsButton = screen.getByText('Show Action Items');
      await user.click(actionItemsButton);

      await waitFor(async () => {
        const input = screen.getByPlaceholderText('Add an action item...');
        const addButton = screen.getByText('Add');

        await user.type(input, 'Improve daily standup format');
        await user.click(addButton);

        // Should show the added action item
        expect(screen.getByText('Improve daily standup format')).toBeInTheDocument();
      });
    });

    test('should remove action items', async () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      // Open action items and add one
      const actionItemsButton = screen.getByText('Show Action Items');
      await user.click(actionItemsButton);

      await waitFor(async () => {
        const input = screen.getByPlaceholderText('Add an action item...');
        const addButton = screen.getByText('Add');

        await user.type(input, 'Test action item');
        await user.click(addButton);

        // Remove the action item
        const removeButton = screen.getByTitle('Remove action item');
        await user.click(removeButton);

        // Should not show the removed action item
        expect(screen.queryByText('Test action item')).not.toBeInTheDocument();
      });
    });
  });

  describe('Export Functionality', () => {
    test('should export results when button clicked', async () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      // Mock URL.createObjectURL and related methods
      const mockCreateObjectURL = jest.fn(() => 'mock-url');
      const mockRevokeObjectURL = jest.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      // Mock document.createElement and appendChild
      const mockLink = {
        href: '',
        download: '',
        click: jest.fn(),
      } as HTMLAnchorElement;
      const mockCreateElement = jest.spyOn(document, 'createElement').mockReturnValue(mockLink);
      const mockAppendChild = jest.spyOn(document.body, 'appendChild').mockImplementation();
      const mockRemoveChild = jest.spyOn(document.body, 'removeChild').mockImplementation();

      render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      const exportButton = screen.getByText('Export Results');
      await user.click(exportButton);

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockLink.click).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();

      // Cleanup mocks
      mockCreateElement.mockRestore();
      mockAppendChild.mockRestore();
      mockRemoveChild.mockRestore();
    });
  });

  describe('Multi-User Real-time Updates', () => {
    test('should handle presentation navigation from other users', async () => {
      const session = createMultiUserSession();
      const participant = session.participants.find(p => !p.isHost)!;
      
      const { rerender } = render(
        <ResultsPhase
          session={session}
          participant={participant}
          isConnected={true}
        />
      );

      // Simulate presentation start from host
      const presentationStartCallback = mockSocketService.on.mock.calls
        .find(call => call[0] === 'presentation_started')?.[1];

      if (presentationStartCallback) {
        presentationStartCallback();

        rerender(
          <ResultsPhase
            session={session}
            participant={participant}
            isConnected={true}
          />
        );

        // Should enter presentation mode
        await waitFor(() => {
          expect(screen.getByText('Team Collaboration')).toBeInTheDocument();
        });

        // Simulate navigation from host
        const navigationCallback = mockSocketService.on.mock.calls
          .find(call => call[0] === 'presentation_navigate')?.[1];

        if (navigationCallback) {
          navigationCallback({ itemIndex: 1 });

          rerender(
            <ResultsPhase
              session={session}
              participant={participant}
              isConnected={true}
            />
          );

          // Should show second item
          await waitFor(() => {
            expect(screen.getByText('Process Issues')).toBeInTheDocument();
          });
        }
      }
    });

    test('should handle presentation end from host', async () => {
      const session = createMultiUserSession();
      const participant = session.participants.find(p => !p.isHost)!;
      
      const { rerender } = render(
        <ResultsPhase
          session={session}
          participant={participant}
          isConnected={true}
        />
      );

      // Start presentation
      const presentationStartCallback = mockSocketService.on.mock.calls
        .find(call => call[0] === 'presentation_started')?.[1];

      if (presentationStartCallback) {
        presentationStartCallback();

        rerender(
          <ResultsPhase
            session={session}
            participant={participant}
            isConnected={true}
          />
        );

        // Should be in presentation mode
        await waitFor(() => {
          expect(screen.queryByText('🎉 Retrospective Results')).not.toBeInTheDocument();
        });

        // End presentation
        const presentationEndCallback = mockSocketService.on.mock.calls
          .find(call => call[0] === 'presentation_ended')?.[1];

        if (presentationEndCallback) {
          presentationEndCallback();

          rerender(
            <ResultsPhase
              session={session}
              participant={participant}
              isConnected={true}
            />
          );

          // Should return to summary view
          await waitFor(() => {
            expect(screen.getByText('🎉 Retrospective Results')).toBeInTheDocument();
          });
        }
      }
    });
  });

  describe('Empty States', () => {
    test('should show empty state when no results', () => {
      const emptySession = createMockSession({
        phase: 'RESULTS',
        groups: [],
        responses: [],
        votes: [],
      });
      const host = emptySession.participants?.[0] || createMockSession().participants![0];
      
      render(
        <ResultsPhase
          session={emptySession}
          participant={host}
          isConnected={true}
        />
      );

      expect(screen.getByText('📊')).toBeInTheDocument();
      expect(screen.getByText('No Results Yet')).toBeInTheDocument();
      expect(screen.getByText('Complete the voting phase to see prioritized results.')).toBeInTheDocument();
    });

    test('should show empty presentation state when no voted groups', async () => {
      const emptySession = createMockSession({
        phase: 'RESULTS',
        groups: [],
      });
      const host = emptySession.participants?.[0] || createMockSession().participants![0];
      
      const { rerender } = render(
        <ResultsPhase
          session={emptySession}
          participant={host}
          isConnected={true}
        />
      );

      // Start presentation with empty groups
      const presentationStartCallback = mockSocketService.on.mock.calls
        .find(call => call[0] === 'presentation_started')?.[1];

      if (presentationStartCallback) {
        presentationStartCallback();

        rerender(
          <ResultsPhase
            session={emptySession}
            participant={host}
            isConnected={true}
          />
        );

        await waitFor(() => {
          expect(screen.getByText('No Results to Display')).toBeInTheDocument();
        });
      }
    });
  });

  describe('Keyboard Navigation', () => {
    test('should handle keyboard navigation in presentation mode', async () => {
      const session = createMultiUserSession();
      const host = session.participants.find(p => p.isHost)!;
      
      const { rerender } = render(
        <ResultsPhase
          session={session}
          participant={host}
          isConnected={true}
        />
      );

      // Start presentation
      const presentationStartCallback = mockSocketService.on.mock.calls
        .find(call => call[0] === 'presentation_started')?.[1];

      if (presentationStartCallback) {
        presentationStartCallback();

        rerender(
          <ResultsPhase
            session={session}
            participant={host}
            isConnected={true}
          />
        );

        // Simulate right arrow key press
        fireEvent.keyDown(window, { key: 'ArrowRight' });

        expect(mockSocketService.emit).toHaveBeenCalledWith('navigate_presentation', {
          sessionId: session.id,
          itemIndex: 1,
        });

        // Simulate left arrow key press
        fireEvent.keyDown(window, { key: 'ArrowLeft' });

        expect(mockSocketService.emit).toHaveBeenCalledWith('navigate_presentation', {
          sessionId: session.id,
          itemIndex: 0,
        });

        // Simulate escape key press
        fireEvent.keyDown(window, { key: 'Escape' });

        expect(mockSocketService.emit).toHaveBeenCalledWith('end_presentation', {
          sessionId: session.id,
        });
      }
    });
  });
});