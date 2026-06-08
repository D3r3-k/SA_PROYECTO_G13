import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { env } from "../config/env";

const protoPath = path.resolve(__dirname, "../../../../proto/engagement.proto");

const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;

export const engagementClient = new protoDescriptor.engagement.EngagementService(
  env.engagementGrpcUrl,
  grpc.credentials.createInsecure()
);

export function callEngagementMethod<TRequest, TResponse>(
  methodName: string,
  payload: TRequest
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    engagementClient[methodName](
      payload,
      (error: grpc.ServiceError | null, response: TResponse) => {
        if (error) {
          return reject(error);
        }
        return resolve(response);
      }
    );
  });
}
