import { useState, useEffect, useRef, useCallback } from "react";
import { useAppContext } from "../store/AppProvider";
import { api } from "../api/client";
import { supabase as rawSupabase } from "../lib/supabase";
const supabase = rawSupabase!;
import type { Message } from "../store/appState";

function formatPrice(v: number) { return "₡" + Number(v || 0).toLocaleString("es-CR"); }

export default function ChatScreen() {
  const { user, activeProduct: product, goTo, goBack } = useAppContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sr, setSr] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const saleRequestId = (product as any)?._saleRequestId;
  const isSeller = user?.id === product?.user_id;
  const isBuyer = user?.id !== product?.user_id;
  const canSend = sr?.status !== "rejected" && sr?.status !== "cancelled" && sr?.status !== "completed";

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Fetch sale request info + messages
  useEffect(() => {
    if (!saleRequestId || !user) return;
    setLoaded(true);

    api(`/api/sale-requests/${saleRequestId}/messages`)
      .then(data => {
        setMessages(data.messages || []);
        scrollToBottom();
      })
      .catch(() => {});

    api("/api/sale-requests/mine")
      .then(data => {
        const all = [...(data.asBuyer || []), ...(data.asSeller || [])];
        const found = all.find((r: any) => r.id === saleRequestId);
        if (found) setSr(found);
      })
      .catch(() => {});
  }, [saleRequestId, user, scrollToBottom]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!saleRequestId) return;
    const channel = supabase
      .channel(`messages:${saleRequestId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `sale_request_id=eq.${saleRequestId}`,
      }, (payload: any) => {
        const newMsg = payload.new as Message;
        setMessages(prev => prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        scrollToBottom();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [saleRequestId, scrollToBottom]);

  async function sendMessage() {
    if (!input.trim() || sending || !saleRequestId) return;
    setSending(true);
    const text = input.trim();
    setInput("");
    try {
      await api(`/api/sale-requests/${saleRequestId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: text }),
      });
    } catch {
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  async function handleAction(status: string) {
    if (!saleRequestId) return;
    await api(`/api/sale-requests/${saleRequestId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }).catch(() => {});
    const data = await api("/api/sale-requests/mine").catch(() => ({ asBuyer: [], asSeller: [] }));
    const all = [...(data.asBuyer || []), ...(data.asSeller || [])];
    const found = all.find((r: any) => r.id === saleRequestId);
    if (found) setSr(found);
  }

  if (!product || !user) return null;

  return (
    <div className="view chat-view">
      <div className="chat-header">
        <button className="small-btn secondary" onClick={goBack}>◀</button>
        <div className="chat-product-info">
          {product.image_url && <img src={product.image_url} alt="" className="chat-product-thumb" />}
          <div>
            <div className="chat-product-name">{product.name}</div>
            <div className="chat-product-price">{formatPrice(product.price)}</div>
          </div>
        </div>
      </div>

      <div className="chat-messages">
        {!loaded && <div className="chat-loading">Cargando...</div>}
        {loaded && messages.length === 0 && (
          <div className="chat-empty">
            {isSeller ? "Has recibido una solicitud de interés." : "Has solicitado esta prenda."}
            {sr?.status === "requested" && isSeller && " ¿Quieres aceptar o rechazar?"}
            {sr?.status === "requested" && isBuyer && " Espera a que el vendedor responda."}
            {sr?.status === "accepted" && " ¡La solicitud fue aceptada! Pueden negociar aquí."}
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`chat-bubble ${msg.sender_id === user.id ? "own" : "other"}`}>
            <div className="chat-bubble-text">{msg.content}</div>
            <div className="chat-bubble-time">
              {new Date(msg.created_at).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {canSend && (
        <div className="chat-input-row">
          <input
            className="field chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
            placeholder="Escribe un mensaje..."
            disabled={sending}
          />
          <button className="small-btn" onClick={sendMessage} disabled={sending || !input.trim()}>
            {sending ? "..." : "Enviar"}
          </button>
        </div>
      )}

      {sr && (
        <div className="chat-actions">
          {sr.status === "requested" && isSeller && (
            <div className="chat-action-buttons">
              <button className="small-btn" onClick={() => handleAction("accepted")}>Aceptar solicitud</button>
              <button className="small-btn secondary" onClick={() => handleAction("rejected")}>Rechazar</button>
            </div>
          )}
          {sr.status === "requested" && isBuyer && (
            <button className="small-btn secondary" onClick={() => handleAction("cancelled")}>Cancelar solicitud</button>
          )}
          <div className="chat-status">
            Estado: {sr.status === "requested" ? "Pendiente" : sr.status === "accepted" ? "Aceptada" : sr.status === "rejected" ? "Rechazada" : sr.status === "cancelled" ? "Cancelada" : sr.status}
          </div>
        </div>
      )}
    </div>
  );
}
