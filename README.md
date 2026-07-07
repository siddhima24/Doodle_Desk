# 🎨 Doodle Desk: Real-Time Collaborative Workspace

Doodle Desk is a full-stack, real-time collaborative web application that allows multiple users to seamlessly share a workspace. Whether you are brainstorming on a shared digital canvas or syncing notes in a live text editor, Doodle Desk synchronizes your interactions across all connected devices with sub-millisecond latency.

## ✨ Features

* **Real-Time Synchronization:** Powered by Socket.io for instant bi-directional communication between clients and the server.
* **Cross-Platform Canvas:** An interactive HTML5 drawing board fully optimized for both desktop mouse events and mobile touch screens.
* **Network Resilience:** Smart connection protocols that automatically downgrade from WebSockets to HTTP long-polling to bypass restrictive institutional firewalls.
* **Mobile-First Design:** Fully responsive UI built with CSS Flexbox that adapts gracefully to any screen size.
* **Secure Admin Controls:** Environment-variable-protected administrative routes for managing the active workspace.

## 🛠️ Tech Stack

* **Frontend:** React.js, HTML5 Canvas, CSS3
* **Backend:** Node.js, Express.js, Socket.io
* **Deployment:** Vercel (Frontend CI/CD), Render (Backend Web Service)
