package app

import "testing"

func TestLaunchQueueCallsHandlerWhenSet(t *testing.T) {
	var q LaunchQueue
	var got []bool
	q.SetHandler(func(capture bool) { got = append(got, capture) })
	q.OnSecondInstance([]string{"kraa"})
	q.OnSecondInstance([]string{"kraa", TriggerArg})
	if len(got) != 2 || got[0] || !got[1] {
		t.Fatalf("got = %v", got)
	}
	if a := q.Drain(nil, false); a != StartupNone {
		t.Fatalf("Drain = %v, want StartupNone (nada pendente)", a)
	}
}

func TestLaunchQueueQueuesUntilHandlerAndDrainsOnce(t *testing.T) {
	var q LaunchQueue
	q.OnSecondInstance([]string{"kraa", TriggerArg})
	q.OnSecondInstance([]string{"kraa"}) // o primeiro pendente vence (CAS)
	if a := q.Drain(nil, false); a != StartupTrigger {
		t.Fatalf("Drain = %v, want StartupTrigger", a)
	}
	if a := q.Drain(nil, false); a != StartupNone {
		t.Fatalf("segundo Drain = %v, want StartupNone", a)
	}
}

func TestLaunchQueueDrainPriorities(t *testing.T) {
	cases := []struct {
		name     string
		pending  []string
		osArgs   []string
		mustShow bool
		want     StartupAction
	}{
		{"nada", nil, nil, false, StartupNone},
		{"show pendente", []string{"kraa"}, nil, false, StartupShow},
		{"--trigger no próprio boot", nil, []string{TriggerArg}, false, StartupTrigger},
		{"mustShow (erro de config ou atalho)", nil, nil, true, StartupShow},
		{"trigger vence mustShow", nil, []string{TriggerArg}, true, StartupTrigger},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var q LaunchQueue
			if c.pending != nil {
				q.OnSecondInstance(c.pending)
			}
			if got := q.Drain(c.osArgs, c.mustShow); got != c.want {
				t.Fatalf("Drain = %v, want %v", got, c.want)
			}
		})
	}
}
