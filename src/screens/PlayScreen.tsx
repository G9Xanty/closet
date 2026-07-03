import { useAppContext } from "../store/AppProvider";

export default function PlayScreen() {
  const { goTo } = useAppContext();

  return (
    <div className="view screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <div className="brand-title">Closet Elander</div>
      <button className="play-btn" onClick={() => goTo("loading")}>PLAY</button>
    </div>
  );
}
