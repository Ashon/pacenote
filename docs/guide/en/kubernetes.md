---
title: Connect Kubernetes
summary: Let Pace look at your clusters when it answers, as a read-only account of its own in each, in three steps in Settings > Tools.
kind: start
order: 3
shot: tools-k8s
---

## What Pace does with it

With Kubernetes connected, Pace can look at your clusters while it answers you in Slack: `get`, `describe`, `logs`,
`events` and `top`. It reads each cluster as an account of its own, `pacenote-ro` in the `pacenote` namespace, never
with your login. That account can't read secrets or change anything, whatever a request asks. Its token stays in Pace's
broker, a VM of its own, and the model only asks the broker for these lookups.

## Before you start

- The built-in sandbox is on (Settings > Sandbox), and so are Tools (Settings > Tools).
- kubectl is on this Mac and signed in to your clusters: `kubectl get namespaces` works for each of them.

## Three steps

Open **Settings > Tools** and click **Kubernetes**. The steps are under its settings.

![Settings > Tools > Kubernetes: three clusters, their accounts, and what Pace reads with](shot:tools-k8s)

### 1. Pick your clusters

Your kubeconfig's contexts are under the setting. Click the ones Pace should read. Without kubectl, the step says so:
install it with `brew install kubectl`, then click Look again.

### 2. Give each cluster a read-only account

Each cluster you picked says whether it has the account.

- **Account ready**: nothing to do.
- **No account yet**, with **Make it here**: you may make it with your own access. Pacenote says what it adds, and
  makes it when you click **Make**: the `pacenote` namespace, the `pacenote-ro` account and its token, and two bindings
  that only read.
- **No account yet** or **You can't see the account here**, with **For your admin**: you can't make it in that cluster.
  Send the YAML it shows to whoever runs the cluster. It also lets you read the account's token, so your Pacenote can
  use the account once it is applied. Then click **Check again**.

**What's in the account** shows the YAML. It is the same in every cluster: the built-in `view` role, which leaves out
secrets, and reads of nodes, namespaces, storage and metrics.

### 3. Connect Pace

Click **Save**. Pace starts again and builds its own kubeconfig: each cluster's address and CA from your kubeconfig,
and the account's token. Your own credentials never go into it. The step then asks each cluster, with that token, what
Pace may do, and shows **Reads**, **No secrets** and **No changes**.

A cluster that was left out when Pace started, because its account wasn't there yet, joins when you click
**Connect again**.

## When a cluster doesn't connect

- **kubectl has to sign in to this cluster**: run the command it shows in Terminal once (it may open your browser
  to sign in), then click Check again.
- **The cluster doesn't answer**: connect to the VPN or network the cluster is on, then click Check again.
- **Not a context in your kubeconfig**: its name changed. Pick it again from the list.
- **Made, waiting for its token**: the cluster adds the token within seconds. Click Check again.
- **This account can do more than read**: someone bound more roles to `pacenote-ro`. Pace still only reads, but take
  the extra bindings away.

Opened from the Dock or Finder, Pacenote's kubectl reads `~/.kube/config`. Contexts kept in other files through
`KUBECONFIG` need to be in that file too.

## Take it out of a cluster

```sh
kubectl delete namespace pacenote
kubectl delete clusterrolebinding,clusterrole -l app=pacenote
```

Then take the cluster out of the setting and click Save.

## Another name

The account is `pacenote-ro` in the `pacenote` namespace in every cluster. If your clusters have a read-only account
by another name already, set it and its namespace under Kubernetes' **Advanced** settings. The steps then look for, make
and copy that one.
