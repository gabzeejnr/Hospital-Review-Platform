
import swaggerJsdoc from "swagger-jsdoc";

const options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Hospital Review Platform API",
      version: "1.0.0",
      description:
        "API documentation for the Hospital Review Platform.",
    },
    servers: [
      {
        url: "http://localhost:5000",
        description: "Local development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter the Supabase access token.",
        },
      },
    },
  },
  apis: ["./src/routes/*.js", "./server.js"],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
