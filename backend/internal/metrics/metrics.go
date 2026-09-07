// Package metrics declares every Prometheus collector the server exposes and
// registers them on a private registry rather than the global default, so
// /metrics serves exactly this list and nothing an imported package happened
// to register on the side.
package metrics

import "github.com/prometheus/client_golang/prometheus"

// Registry is the collector set served at /metrics.
var Registry = prometheus.NewRegistry()

var (
	ConnectionsActive = mustRegister(prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "dofusjs_connections_active",
		Help: "WebSocket connections currently open.",
	})).(prometheus.Gauge)

	Rooms = mustRegister(prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Name: "dofusjs_rooms",
		Help: "Open rooms by lifecycle status.",
	}, []string{"status"})).(*prometheus.GaugeVec)

	CommandsTotal = mustRegister(prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "dofusjs_commands_total",
		Help: "Inbound WebSocket commands, by message type.",
	}, []string{"kind"})).(*prometheus.CounterVec)

	CommandDuration = mustRegister(prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "dofusjs_command_duration_seconds",
		Help:    "Time to resolve an accepted command under the game lock, by message type.",
		Buckets: prometheus.DefBuckets,
	}, []string{"kind"})).(*prometheus.HistogramVec)

	ActionsRejected = mustRegister(prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "dofusjs_actions_rejected_total",
		Help: "Actions rejected by the game engine, by reason.",
	}, []string{"reason"})).(*prometheus.CounterVec)

	TurnTimeouts = mustRegister(prometheus.NewCounter(prometheus.CounterOpts{
		Name: "dofusjs_turn_timeouts_total",
		Help: "Turns that ended because the player ran out of time.",
	})).(prometheus.Counter)

	BotDecisionDuration = mustRegister(prometheus.NewHistogram(prometheus.HistogramOpts{
		Name:    "dofusjs_bot_decision_duration_seconds",
		Help:    "Time for the bot to play one step.",
		Buckets: prometheus.DefBuckets,
	})).(prometheus.Histogram)

	BroadcastDuration = mustRegister(prometheus.NewHistogram(prometheus.HistogramOpts{
		Name:    "dofusjs_broadcast_duration_seconds",
		Help:    "Time to fan a room's game-state snapshot out to its members.",
		Buckets: prometheus.DefBuckets,
	})).(prometheus.Histogram)

	ClientSendDropped = mustRegister(prometheus.NewCounter(prometheus.CounterOpts{
		Name: "dofusjs_client_send_dropped_total",
		Help: "Messages dropped because a client's send buffer was full.",
	})).(prometheus.Counter)

	Reconnects = mustRegister(prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "dofusjs_reconnects_total",
		Help: "WebSocket connections established, by whether they resumed a session.",
	}, []string{"resumed"})).(*prometheus.CounterVec)
)

func mustRegister(c prometheus.Collector) prometheus.Collector {
	Registry.MustRegister(c)
	return c
}
