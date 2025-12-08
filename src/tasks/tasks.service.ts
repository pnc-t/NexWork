import {
    Injectable,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import {WebSocketsGateway} from "../websockets/websockets.gateway";

@Injectable()
export class TasksService {
    constructor(
        private readonly prisma:PrismaService,
        private readonly websockets: WebSocketsGateway,
        ) {}

    async create(userId: string, createTaskDto: CreateTaskDto) {
        const { projectId, dependsOn, ...taskData } = createTaskDto;

        await this.checkProjectAccess(projectId, userId);

        if (dependsOn && dependsOn.length > 0) {
            await this.validateDependencies(dependsOn, projectId);
        }

        const task = await this.prisma.task.create({
            data:{
                ...taskData,
                projectId,
                createdById: userId,
                dependencies: dependsOn ? {
                    create: dependsOn.map((taskId) => ({
                        dependsOnId: taskId,
                    })),
                }
                : undefined,
            },
            include: {
                assignee:{
                    select:{
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                createdBy:{
                    select:{
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                dependencies:{
                    include:{
                        dependsOn:true,
                    },
                },
            },
        });

        this.websockets.notifyTaskCreated(task.projectId, task);
        return task;
    }

    async findAll(userId:string, projectId?:string){
        const where:any = {};

        if(projectId) {
            await this.checkProjectAccess(projectId, userId);
            where.projectId=projectId;
        }else{
            where.project = {
                members:{
                    some:{
                        userId,
                    },
                },
            };
        }
        return this.prisma.task.findMany({
            where,
            include:{
                assignee:{
                    select:{
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                project: {
                    select:{
                        id: true,
                        name: true,
                    },
                },
                dependencies: {
                    include: {
                        dependsOn: {
                            select: {
                                id: true,
                                title: true,
                                status: true,
                            },
                       },
                    },
                },
            },
            orderBy:{
                createdAt:'desc',
            },
        });
    }

    async findOne(taskId:string, userId:string){
        const task = await this.prisma.task.findUnique({
            where:{ id: taskId },
            include:{
                assignee:{
                    select:{
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                createdBy:{
                    select:{
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                project:{
                    select:{
                        id: true,
                        name: true,
                    },
                },
                dependencies:{
                    include:{
                        dependsOn:{
                            select:{
                                id: true,
                                title: true,
                                status: true,
                            },
                        },
                    },
                },
                dependents:{
                    include:{
                        task:{
                            select:{
                                id: true,
                                title: true,
                                status: true,
                            },
                        },
                    },
                },
            },
        });

        if(!task){
            throw new NotFoundException('タスクが見つかりません');
        }
        await this.checkProjectAccess(task.projectId, userId);

        return task;
    }

    async update(taskId:string,userId:string, updateTaskDto:UpdateTaskDto) {
        const task = await this.findOne(taskId, userId);

        const updateTask = await this.prisma.task.update({
            where:{id: taskId},
            data: updateTaskDto,
            include:{
                assignee:{
                    select:{
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                dependencies:{
                    include:{
                        dependsOn:true,
                    },
                },
            },
        });
        this.websockets.notifyTaskUpdated(updateTask.projectId, taskId, updateTask);
        return updateTask;


    }

    async remove(taskId:string ,userId:string){
        await this.findOne(taskId, userId);

        return this.prisma.task.delete({
            where:{id: taskId}
        });
    }

    async getTasksByStatus(userId:string, projectId: string){
        await this.checkProjectAccess(projectId, userId);

        const tasks = await this.prisma.task.findMany({
            where:{projectId},
            include:{
                assignee:{
                    select:{
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        return {
            todo: tasks.filter((t) => t.status === 'todo'),
            in_progress: tasks.filter((t) => t.status === 'in_progress'),
            done: tasks.filter((t) => t.status === 'done'),
        };
    }

    private async checkProjectAccess(projectId:string, userId:string,){
        const member = await this.prisma.projectMember.findFirst({
            where: {
                projectId,
                userId
            },
        });
        if (!member) {
            throw new ForbiddenException('このプロジェクトへのアクセス権限がありません');
        }
    }

    private async validateDependencies(taskIds:string[], projectId:string){
        const tasks = await this.prisma.task.findMany({
            where:{
                id: {in:taskIds},
                projectId,
            },
        });

        if (tasks.length !== taskIds.length) {
            throw new BadRequestException('無効な依存タスクが含まれています');
        }
    }
}
