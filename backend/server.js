const express = require ("express");
const app = express();
const PORT = 5000;
app.use(express.json());

app.get("/", (req,res) => {
    res.json({
        message:"welcome to Hospital Review Platform",
        status:"Backend is running successfully"
    });
});

app.get("/api/hospitals", (req,res) =>{
    res.json({
        message:"Hosital API is working",
        hospitals:[]
    });
} );

app.listen(PORT, ()=>{
    console.log(`server running at http://localhost:${PORT}`);
});