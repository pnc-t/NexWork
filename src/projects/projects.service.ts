import {
    Injectable,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import {PrismaService} from "../prisma/prisma.service";
import {CreateProjectDto} from "./dto/create-project.dto";
import {UpdateProjectDto} from "./dto/update-project.dto";
import {AddMemberDto} from "./dto/add-member.dto";

@Injectable()
export class ProjectsService {
    constructor(private readonly prisma: PrismaService) {}

    async create(userId: string, createProjectDto:CreateProjectDto) {
        return this.prisma.project.create({
            data:{
                ...createProjectDto,
                members:{
                    create:{
                        userId:userId,
                        role:'owner',
                    },
                },
            },
            include:{
                members:{
                    include:{
                        user:{
                            select:{
                                id:true,
                                name:true,
                                email:true,
                            },
                        },
                    },
                },
                _count:{
                    select:{
                        tasks:true,
                    },
                },
            },
        });
    }

    async findAll(userId:string) {
        return this.prisma.project.findMany({
            where:{
                members:{
                    some:{
                        userId,
                    },
                },
            },
            include:{
                members:{
                    include:{
                        user:{
                            select:{
                                id:true,
                                name:true,
                                email:true,
                            },
                        },
                    },
                },
                _count:{
                    select:{
                        tasks:true,
                    },
                },
            },
            orderBy:{
                createdAt:'desc'
            },
        });
    }

    async findOne(projectId: string, userId: string) {
        const project = await this.prisma.project.findUnique({
            where:{ id:projectId },
            include:{
                members:{
                    include:{
                        user:{
                            select:{
                                id:true,
                                name:true,
                                email:true,
                            },
                        },
                    },
                },
                tasks:{
                    include:{
                        assignee:{
                            select:{
                                id:true,
                                name:true,
                                email:true,
                            },
                        },
                    },
                    orderBy:{
                        createdAt:'desc',
                    },
                },
            },
        });

        if (!project) {
            throw new NotFoundException('Not Found Project');
        }

        const isMember = project.members.some(
            (member) => member.userId === userId,
        );

        if (isMember) {
            throw new ForbiddenException('Not AccessPermission for This Project');
        }
        return project;
    }

    async update(projectId:string, userId:string, updateProjectDto:UpdateProjectDto) {
        await this.checkPermission(projectId, userId,['owner','admin']);

        return this.prisma.project.update({
            where:{ id:projectId },
            data: updateProjectDto,
            include:{
                members:{
                    include:{
                        user:{
                            select:{
                                id:true,
                                name:true,
                                email:true,
                            },
                        },
                    },
                },
            },
        });
    }

    async remove(projectId: string, userId: string) {
        await this.checkPermission(projectId, userId,['owner']);

        return this.prisma.project.delete({
            where:{ id: projectId },
        });
    }

    async addMember(projectId: string, userId: string, addMemberDto: AddMemberDto) {
        await this.checkPermission(projectId, userId,['owner','admin']);

        return this.prisma.projectMember.create({
            data:{
                projectId,
                userId:addMemberDto.userId,
                role:addMemberDto.role,
            },
            include:{
                user:{
                    select:{
                        id:true,
                        name:true,
                        email:true,
                    },
                },
            },
        });
    }

    async removeMember(projectId: string, userId: string, memberId: string) {
        await this.checkPermission(projectId, userId,['owner','admin']);

        return this.prisma.projectMember.delete({
            where:{ id: memberId },
        })
    }

    async checkPermission(
        projectId: string,
        userId: string,
        allowedRoles: string[],
    ){
        const member = await this.prisma.projectMember.findFirst({
            where:{
                projectId,
                userId,
            },
        });
        if (!member || !allowedRoles.includes(member.role)) {
            throw new ForbiddenException('Not AccessPermission for Control ');
        }

        return member;
    }
}
