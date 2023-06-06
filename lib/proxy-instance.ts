import { Construct } from 'constructs';

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

import * as fs from 'fs';

export interface PoxyInstanceProps extends cdk.StackProps {
    sg: ec2.SecurityGroup,
    vpc: ec2.Vpc,
    stackname: string,
}
export class PoxyInstance extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PoxyInstanceProps) {
    super(scope, id, props);

    // SSM
    const iam_role = new iam.Role(this, 'iam_role_for_proxy_ssm', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentAdminPolicy'),
      ],
    });
    const iamInstanceProfile = new iam.CfnInstanceProfile(this, 'InstanceProfile', {
      path: '/',
      roles: [iam_role.roleName]
    });
  
    // Proxy Instance
    const machineImageId = ec2.MachineImage.latestAmazonLinux({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      edition: ec2.AmazonLinuxEdition.STANDARD,
      //kernel: ec2.AmazonLinuxKernel.KERNEL5_X,
      virtualization: ec2.AmazonLinuxVirt.HVM,
      //storage: ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
      //cpuType: ec2.AmazonLinuxCpuType.X86_64,
      cpuType: ec2.AmazonLinuxCpuType.ARM_64,
    }).getImage(this).imageId;

    const instance = new ec2.CfnInstance(this, 'ProxyInstance', {
      blockDeviceMappings: [{
        deviceName: '/dev/xvda',
          ebs: {
            deleteOnTermination: true,
            encrypted: true,
            volumeSize: 8,
            volumeType: ec2.EbsDeviceVolumeType.GENERAL_PURPOSE_SSD_GP3, // ref: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.EbsDeviceVolumeType.html
            //volumeType: ec2.EbsDeviceVolumeType.STANDARD, // ref: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ec2.EbsDeviceVolumeType.html
        }
      }],
      imageId: machineImageId,
      //instanceType: 't3a.nano', // 2 vCPU, 0.5 GB (AMD)
      instanceType: 't4g.nano', // 2 vCPU, 0.5 GB (ARM)
      iamInstanceProfile: iamInstanceProfile.ref,
      securityGroupIds: [props.sg.securityGroupId],
      //sourceDestCheck: false, // Required by NAT Instance Operation
      subnetId: props.vpc.publicSubnets[0].subnetId,
      userData: cdk.Fn.base64(fs.readFileSync('./lib/user-data-proxy.yaml', 'utf8')),
      tags: [{
        "key": "Name",
        "value": props.stackname+"/ProxyInstance"
      }]
    });
    const instanceId = instance.ref;
  }
}