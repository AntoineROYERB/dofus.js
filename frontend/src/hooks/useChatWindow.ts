import { useState, useCallback, useRef, useEffect } from "react";

export const useChatWindow = (chatMessages: any[]) => {
  const [height, setHeight] = useState(200); // Initial height
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const startResizing = useCallback(
    (mouseDownEvent: React.MouseEvent<HTMLDivElement>) => {
      const startY = mouseDownEvent.clientY;
      const startHeight = chatWindowRef.current?.offsetHeight || height;

      const doDrag = (mouseMoveEvent: MouseEvent) => {
        const newHeight = startHeight - (mouseMoveEvent.clientY - startY);
        setHeight(newHeight > 100 ? newHeight : 100); // Set a minimum height
      };

      const stopDrag = () => {
        window.removeEventListener("mousemove", doDrag);
        window.removeEventListener("mouseup", stopDrag);
      };

      window.addEventListener("mousemove", doDrag);
      window.addEventListener("mouseup", stopDrag);
    },
    [height]
  );

  return {
    height,
    setHeight,
    messagesEndRef,
    chatWindowRef,
    startResizing,
  };
};
