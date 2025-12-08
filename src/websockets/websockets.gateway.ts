import {
    WebSocketGateway,
    WebSocketServer,
    SubscribeMessage,
    OnGatewayConnection,
    OnGatewayDisconnect,
    ConnectedSocket,
    MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger, UseGuards } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

@WebSocketGateway({
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        credentials: true
    }
})
export class WebSocketsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(WebSocketsGateway.name);
    private userSockets: Map<string, Set<string>> = new Map();

    constructor(private readonly jwtService: JwtService) {}

    async handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth.token;

            if (!token) {
                client.disconnect();
                return;
            }

            const payload = this.jwtService.verify(token);
            const userId = payload.sub;

            client.data.userId = userId;

            if (!this.userSockets.has(userId)) {
                this.userSockets.set(userId, new Set());
            }
            this.userSockets.get(userId)!.add(client.id);

            this.logger.log(`User connected: ${client.id}`);
            this.server.emit('user_online', { userId });

        } catch (error) {
            this.logger.error("User Connection Error:", error);
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        const userId = client.data.userId;

        if (userId) {
            const socketSet = this.userSockets.get(userId);

            if (socketSet) {
                socketSet.delete(client.id);

                if (socketSet.size === 0) {
                    this.userSockets.delete(userId);
                    this.server.emit('user_offline', { userId });
                }
            }
        }

        this.logger.log(`User disconnected: ${client.id}`);
    }

    @SubscribeMessage("project:join")
    handleJoinProject(
        @ConnectedSocket() client: Socket,
        @MessageBody() data:{projectId: string},
    ) {
        client.join(`project:${data.projectId}`);
        this.logger.log(`User joined: ${client.data.userId} at ${data.projectId}`);
    }


    @SubscribeMessage('project:leave')
    handleLeaveProject(
        @ConnectedSocket() client: Socket,
        @MessageBody() data: { projectId: string },
    ) {
        client.leave(`project:${data.projectId}`);
        this.logger.log(`User left: ${client.data.userId} at ${data.projectId}`);
    }

    // プロジェクト関連のイベント
    notifyProjectCreated(projectId: string, data: any) {
        this.server.emit('project:created', { projectId, data });
    }

    notifyProjectUpdated(projectId: string, data: any) {
        this.server.to(`project:${projectId}`).emit('project:updated', { projectId, data });
    }

    notifyProjectDeleted(projectId: string) {
        this.server.to(`project:${projectId}`).emit('project:deleted', { projectId });
    }

    // タスク関連のイベント
    notifyTaskCreated(projectId: string, data: any) {
        this.server.to(`project:${projectId}`).emit('task:created', { projectId, data });
    }

    notifyTaskUpdated(projectId: string, taskId: string, data: any) {
        this.server.to(`project:${projectId}`).emit('task:updated', { projectId, taskId, data });
    }

    notifyTaskDeleted(projectId: string, taskId: string) {
        this.server.to(`project:${projectId}`).emit('task:deleted', { projectId, taskId });
    }

    // メンバー関連のイベント
    notifyMemberAdded(projectId: string, data: any) {
        this.server.to(`project:${projectId}`).emit('member:added', { projectId, data });
    }

    notifyMemberRemoved(projectId: string, memberId: string) {
        this.server.to(`project:${projectId}`).emit('member:removed', { projectId, memberId });
    }

    // ユーザーにメッセージを送信
    sendToUser(userId: string, event: string, data: any) {
        const sockets = this.userSockets.get(userId);
        if (sockets) {
            sockets.forEach((socketId) => {
                this.server.to(socketId).emit(event, data);
            });
        }
    }
}
