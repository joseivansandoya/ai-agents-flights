'use client';

import { useEffect, useState } from 'react';

export default function Home() {
  const [streamedText, setStreamedText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [lastResponseId, setLastResponseId] = useState<string>();

  const [prompt, setPrompt] = useState("");
  
  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    
    // Reset states for new request
    setStreamedText('');
    setIsConnected(false);
    setIsComplete(false);
    
    try {
      setIsConnected(true);
      
      const response = await fetch('http://localhost:5005/agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, lastResponseId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body reader available');
      }

      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          setIsComplete(true);
          setIsConnected(false);
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'end') {
                setIsComplete(true);
                setIsConnected(false);
                setLastResponseId(data.lastResponseId);
                return;
              } else if (data.text) {
                setStreamedText(prev => prev + data.text);
              }
            } catch (error) {
              console.error('Error parsing SSE data:', error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      setIsConnected(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">
          AI Agents Flights - SSE Demo
        </h1>

        <div className='my-4'>
          <input
            type="text"
            className='bg-white p-3'
            placeholder='Enter your prompt...'
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
          <button
            type="button"
            className='p-3 border border-black cursor-pointer'
            onClick={handleSubmit}
          >
            SEND
          </button>
        </div>
        
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
      </div>
    </div>
  );
}
