import CreateSession from '@/components/CreateSession';
import JoinSession from '@/components/JoinSession';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-200 via-purple-200 to-green-200 apple-background">
      {/* Apple decorations for larger screens */}
      <div className="apple-1 hidden md:block">🍎</div>
      <div className="apple-2 hidden md:block">🍎</div>
      <div className="apple-3 hidden md:block">🍎</div>
      <div className="apple-4 hidden md:block">🍎</div>
      
      <div className="container mx-auto px-4 py-16 relative z-10">
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold mb-4 leading-tight creative-heading">
            <span className="bg-gradient-to-r from-purple-600 via-pink-500 to-red-500 bg-clip-text text-transparent font-black tracking-wider transform -rotate-1 inline-block animated-gradient">
              REDAPL
            </span>
            <span className="bg-gradient-to-r from-orange-500 via-yellow-500 to-orange-600 bg-clip-text text-transparent font-black mx-3 animated-gradient transform hover:scale-110 inline-block -translate-y-0.5">
              STORAGE
            </span>
            <span className="bg-gradient-to-r from-green-500 via-blue-500 to-purple-600 bg-clip-text text-transparent font-extrabold tracking-wide transform rotate-1 inline-block animated-gradient">
              Retro
            </span>
            <span className="text-4xl ml-2 rocket-float">🚀</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Let&apos;s reflect on the past month of working together and come up with some action items
          </p>
        </div>

        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          <ErrorBoundary>
            <CreateSession />
          </ErrorBoundary>
          <ErrorBoundary>
            <JoinSession />
          </ErrorBoundary>
        </div>

        <div className="mt-16 text-center">
          <div className="grid md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            <div className="text-center">
              <div className="bg-gradient-to-br from-blue-300 to-cyan-400 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <span className="text-2xl">💭</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Private Input</h3>
              <p className="text-sm text-gray-600">Share thoughts privately before revealing to the team</p>
            </div>
            <div className="text-center">
              <div className="bg-gradient-to-br from-green-300 to-emerald-400 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                <span className="text-2xl">🎯</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Smart Grouping</h3>
              <p className="text-sm text-gray-600">Drag and cluster related feedback for better insights</p>
            </div>
            <div className="text-center">
              <div className="bg-gradient-to-br from-purple-300 to-green-400 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
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
