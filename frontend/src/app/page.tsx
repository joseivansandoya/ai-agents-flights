'use client';

import { useEffect, useState } from 'react';

export default function Home() {
  const [streamedText, setStreamedText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource('http://localhost:5005/stream');

    eventSource.onopen = () => {
      console.log('SSE connection opened');
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'end') {
          console.log('Stream completed');
          setIsComplete(true);
          eventSource.close();
        } else {
          // Add the new character to the streamed text
          setStreamedText(prev => prev + data.char);
        }
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setIsConnected(false);
      eventSource.close();
    };

    // Cleanup on component unmount
    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">
          AI Agents Flights - SSE Demo
        </h1>
        
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-700 mb-2">
              Streamed Text (Server-Sent Events)
            </h2>
            
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-gray-600">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
              {isComplete && (
                <span className="text-sm text-green-600 font-medium">✓ Complete</span>
              )}
            </div>
          </div>
          
          <div className="bg-gray-50 rounded-md p-4 min-h-[200px]">
            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
              {streamedText || 'Waiting for stream to start...'}
            </p>
            {streamedText && (
              <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1"></span>
            )}
          </div>
          
          <div className="mt-4 text-sm text-gray-500">
            <p>Characters received: {streamedText.length}</p>
            <p>Status: {isComplete ? 'Stream completed' : isConnected ? 'Streaming...' : 'Connecting...'}</p>
          </div>
        </div>
        
        <div className="mt-8 bg-blue-50 rounded-lg p-4">
          <h3 className="font-semibold text-blue-800 mb-2">How it works:</h3>
          <ul className="text-blue-700 text-sm space-y-1">
            <li>• Backend streams a lorem ipsum paragraph character by character</li>
            <li>• Each character is sent as an SSE event with a 50ms delay</li>
            <li>• Frontend receives events in real-time and displays them</li>
            <li>• Connection status is shown with a colored indicator</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
