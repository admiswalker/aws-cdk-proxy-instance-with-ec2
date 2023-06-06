#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PoxyInstTestStack } from '../lib/aws-cdk-proxy-instance-with-ec2-stack';

const app = new cdk.App();

new PoxyInstTestStack(app, 'AwsCdkProxyInstanceWithEc2Stack');
