import { Construct } from 'constructs';

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

import * as fs from 'fs';


interface ProxyInstanceProps extends cdk.StackProps {
    sg: ec2.SecurityGroup,
    stack_name: string,
    vpc: ec2.Vpc,
}
export class ProxyInstance extends cdk.Resource {
    public instance: ec2.CfnInstance;
    constructor(scope: Construct, id: string, props: ProxyInstanceProps) {
    super(scope, id);

    // SSM
    const proxy_iam_role = new iam.Role(this, 'iam_role_for_proxy_ssm', {
        assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
          iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentAdminPolicy'),
        ],
      });
      const iamInstanceProfile = new iam.CfnInstanceProfile(this, 'InstanceProfile', {
        path: '/',
        roles: [proxy_iam_role.roleName]
      });
    
      // Proxy Instance
      const machineImageId = ec2.MachineImage.latestAmazonLinux({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        edition: ec2.AmazonLinuxEdition.STANDARD,
        virtualization: ec2.AmazonLinuxVirt.HVM,
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
        privateIpAddress: '10.0.0.24', // IP address specification
        userData: cdk.Fn.base64(fs.readFileSync('./lib/user-data-proxy.yaml', 'utf8')),
        tags: [{
          "key": "Name",
          "value": props.stack_name+"/ProxyInstance"
        }]
      });
      const instanceId = instance.ref;
    }
}