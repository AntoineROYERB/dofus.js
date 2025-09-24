import React, { useEffect, useState } from "react";

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  speed: number;
  twinkleSpeed: number;
  movementSpeed: number;
  movementAngle: number;
  initialX: number;
  initialY: number;
  movementRadius: number;
}

const StarryBackground: React.FC = () => {
  const [stars, setStars] = useState<Star[]>([]);

  // Generate initial stars
  useEffect(() => {
    const generateStars = () => {
      const newStars: Star[] = [];
      const numStars = Math.floor(
        (window.innerWidth * window.innerHeight) / 200000
      ); // Adjust density

      for (let i = 0; i < numStars; i++) {
        const initialX = Math.random() * 100;
        const initialY = Math.random() * 100;
        newStars.push({
          initialX,
          initialY,
          x: initialX,
          y: initialY,
          size: Math.random() * 2 + 1, // Size between 1-3px
          opacity: Math.random() * 0.7 + 0.3, // Opacity between 0.3-1
          speed: Math.random(), // Base speed
          twinkleSpeed: Math.random(), // Slower twinkle
          movementSpeed: Math.random(), // Movement speed
          movementAngle: Math.random() * Math.PI * 2, // Random initial angle
          movementRadius: Math.random() * 2 + 0.5, // Random movement radius
        });
      }

      setStars(newStars);
    };

    generateStars();

    // Regenerate stars when window is resized
    window.addEventListener("resize", generateStars);
    return () => window.removeEventListener("resize", generateStars);
  }, []);

  // Animate stars
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = Date.now();

    const animate = () => {
      const currentTime = Date.now();
      const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
      lastTime = currentTime;

      setStars((prevStars) =>
        prevStars.map((star) => {
          // Calculate twinkling effect
          const twinkle = Math.sin(currentTime * star.twinkleSpeed) * 0.3;
          const baseOpacity = star.opacity;
          const newOpacity = Math.max(0.1, Math.min(1, baseOpacity + twinkle));

          // Calculate circular movement
          const angle = star.movementAngle + deltaTime * star.movementSpeed;
          const offsetX = Math.cos(angle) * star.movementRadius;
          const offsetY = Math.sin(angle) * star.movementRadius;

          return {
            ...star,
            opacity: newOpacity,
            movementAngle: angle,
            x: star.initialX + offsetX,
            y: star.initialY + offsetY,
          };
        })
      );

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0 bg-black">
      {stars.map((star, index) => (
        <div
          key={index}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            opacity: star.opacity,
            transform: `scale(${1 + (star.opacity - 0.5) * 0.3})`,
            transition: "transform 0.3s ease-out",
            boxShadow: `0 0 ${star.size * 2}px rgba(255, 255, 255, ${
              star.opacity * 0.5
            })`,
          }}
        />
      ))}
    </div>
  );
};

export default StarryBackground;
