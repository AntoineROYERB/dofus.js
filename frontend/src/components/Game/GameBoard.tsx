export const GameBoard: React.FC = () => {
  const { gameState, dispatchGameAction } = useContext(GameContext);
  const { clientId } = useWebSocket();

  const handleMove = (position: Position) => {
    if (gameState?.currentTurn === clientId) {
      dispatchGameAction({
        type: "MOVE",
        playerId: clientId,
        position,
      });
    }
  };

  return (
    <div className="game-board">
      {/* Render game grid */}
      {gameState?.players.map((player) => (
        <PlayerToken
          key={player.id}
          position={player.position}
          isCurrentTurn={player.isCurrentTurn}
        />
      ))}
    </div>
  );
};
