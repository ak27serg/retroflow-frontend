import CreateSession from '@/components/CreateSession';
import JoinSession from '@/components/JoinSession';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-gray-900 mb-4">
            <span className="text-blue-600">REDAPL</span> Storage Retro
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Transform team reflection into actionable insights through collaborative retrospectives
          </p>
        </div>

        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          <CreateSession />
          <JoinSession />
        </div>

        <div className="mt-16 text-center">
          <div className="grid md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            <div className="text-center">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">💭</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Private Input</h3>
              <p className="text-sm text-gray-600">Share thoughts privately before revealing to the team</p>
            </div>
            <div className="text-center">
              <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🎯</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Smart Grouping</h3>
              <p className="text-sm text-gray-600">Drag and cluster related feedback for better insights</p>
            </div>
            <div className="text-center">
              <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🗳️</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Priority Voting</h3>
              <p className="text-sm text-gray-600">Vote on the most important topics to focus on</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
