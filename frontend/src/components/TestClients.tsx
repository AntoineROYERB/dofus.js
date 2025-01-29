import React, { useState } from "react";
import { Chat } from "./Chat/Chat";

export const TestClients: React.FC = () => {
  const [clientCount, setClientCount] = useState(1);

  return (
    <div className="p-4">
      <div className="mb-4">
        <button
          onClick={() => setClientCount((prev) => prev + 1)}
          className="bg-blue-500 text-white px-4 py-2 rounded mr-2"
        >
          Add Client
        </button>
        <button
          onClick={() => setClientCount((prev) => Math.max(1, prev - 1))}
          className="bg-red-500 text-white px-4 py-2 rounded"
        >
          Remove Client
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: clientCount }).map((_, index) => (
          <div key={index} className="border rounded p-4">
            <h3 className="text-lg font-bold mb-2">Client {index + 1}</h3>
            <Chat />
          </div>
        ))}
      </div>
    </div>
  );
};
