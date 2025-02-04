// // src/components/Chat/ChatMessage.tsx
// import React from "react";
// import { Message } from "../../types/message";

// export const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
//   const isSystem = message.type === "game_state";

//   console.log("HELLO", message);
//   const renderContent = () => {
//     if (!message.messageId) {
//       console.warn("Message without ID received:", message);
//       return null;
//     }

//     switch (message.type) {
//       case "chat":
//         return (
//           <>
//             <div className="font-bold text-blue-800 mb-1">
//               {message.userName}
//             </div>
//             <div>{message.content}</div>
//           </>
//         );
//       case "game_state":
//         return <div>Game state updated</div>;
//       default:
//         return null;
//     }
//   };

//   return (
//     <div
//       className={`mb-2 p-3 rounded-lg ${
//         isSystem
//           ? "bg-gray-100 text-gray-600 italic"
//           : "bg-blue-100 border border-blue-200"
//       }`}
//     >
//       {renderContent()}
//     </div>
//   );
// };
