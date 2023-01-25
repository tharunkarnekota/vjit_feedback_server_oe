const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const middleware = require('./middleware')
const dotenv = require('dotenv');
const sendEmail = require('./sendmail')
const crypto = require('crypto')

////

const users = require('./usermodel')                              //students in college
const registerloginmodel = require('./registerloginmodel')
const aluminimodel = require('./aluminimodel')
const teachersmodel = require('./teachersmodel')
const feedbackmodel = require('./feedbackmodel')
const supportteammodel = require('./supportteammodel');
const teachersmodelOE = require('./teachersmodelOE');



const app = express();

dotenv.config()
const PORT = process.env.PORT || 5000
mongoose.connect(process.env.CONNECTION_URL).then(
    ()=> console.log('Db connected..')
)

app.use(express.json());
app.use(cors({origin:"*"}));






app.get('/',(req,res)=>{
    res.send('Hello to VJIT Feedback API 25-12-2022 11:56');
})











































































// registration of students
app.post('/register',async (req,res) =>{
    try{
        const { fullname,collegeId,branch,email,mobile,password,confirmpassword } = req.body;
        const exist = await users.findOne({email});
        if(exist){
            return res.status(200).send('user already registered')
        }
        const existId = await users.findOne({collegeId});
        if(existId){
            return res.status(200).send('this collegeID already registered')
        }
        if(password !== confirmpassword){
            return res.status(400).send('password invalid')
        }

        let newUser = new users({
            fullname,collegeId,branch,email,mobile,password,
            confirmpassword,
            
        })
        newUser.save();
        return res.status(200).send('User Registered Successfully')
    }
    catch(err){
        console.log(err)
        return res.status(500).send('register Server Error')
    }
})






// // // Teachers -- -- --
app.post('/addteacher',async(req,res)=>{
    try{
        const {teacherName,
                teacherDepartment,
                classes,
                teacherqualification,
                teachermob,
                teacheremail
            } = req.body;
        
        const newteacher = new teachersmodel({
            teacherName,
            teacherDepartment,
            classes,
            teacherqualification,
            teachermob,
            teacheremail
        })
        await newteacher.save();
        const exist = await teachersmodel.find()
        return res.status(200).json({message:'New Teacher Added successfully',update:exist})
    }
    catch(err){
        console.log(err);
        return res.status(500).send('New Teacher Server Error')
    }
})



app.post('/getAllTeachers2', async (req,res)=>{
    try{
        const exist = await teachersmodel.find({"classes.year": {$in: [req.body.dept]}})
        return res.status(200).json(exist);
    }
    catch(err){
        console.log(err);
        return res.status(500).send('getAllTeachers Server Error')
    }
})


app.get('/findteacher/:id', async (req,res)=>{
    try{
        const exist = await teachersmodel.findById(req.params.id)
        return res.status(200).json(exist);
    }
    catch(err){
        console.log(err);
        return res.status(500).send('find teacher Server Error')
    }
})





// login for both students and alumini
app.post('/login',async (req,res)=>{
    try{
        const {email,clgId} = req.body;
        let exist = await users.findOne({email})
        if(!exist){
            exist = await aluminimodel.findOne({email})
        }
        if(!exist){
            return res.status(200).send('User not Exist plz register')
        }
        if(exist.collegeId !== clgId){
            return res.status(200).send('collegeId doesnt match')
        }
        let payload = {
            user : {
                id : exist.id
            }
        }
        jwt.sign(payload,'jwtPassword',{expiresIn:360000000},
        (err,token)=>{
            if(err) throw err
            return res.json({token:token,id:exist.branch})
        })

    }
    catch(err){
        console.log(err);
        return res.status(500).send('login Server Error')
    }
})



//loggined user info
app.get('/myprofile',middleware, async (req,res)=>{
    try{
        let myprofile = await users.findById(req.user.id);
        if(!myprofile)
        {
            myprofile = await aluminimodel.findById(req.user.id);
        }
        return res.json(myprofile);
    }
    catch(err){
        console.log(err);
        return res.status(500).send('myprofile Server Error')
    }
})





//get all students profilew
app.get('/allprofiles',middleware,async (req,res) =>{
    try{
        let allprofiles = await users.find();
        return res.json(allprofiles);
    }
    catch(err){
        console.log(err);
        return res.status(500).send('allprofiles Server Error')
    }
})



//forget password for students
app.post('/forgetpassword',async(req,res,next)=>{
    //checking if atleast the users exists or not
    const tuser= await users.findOne({email:req.body.email});

    if(!tuser){
        return res.status(200).send('user not found')
    }

    // get resetpassword token
    const resetToken= tuser.getResetPassword();
    // // console.log(resetToken);
    await tuser.save({validateBeforeSave: false});

    //actual link is http://localhost/api/v1/passwordreset/${resetToken} as local host and http requests
    //can change we use req._
    const resetpasswordURL=`${resetToken}`;
    const resetpasswordMessage = `your's Students Hub reset password verification code is \n\n ${resetpasswordURL} \n\n if u have not
    requested this email, please ignore`;

    try{
        await sendEmail({
            //we will send a object with 3 key value pairs here
            email:tuser.email,
            subject:"Students Hub password Recovery",
            resetpasswordMessage,
        });
        res.status(200).json({
            success:true,
            message:`Email sent to ${tuser.email} successfully`,
        })
    }
    catch(err){
        tuser.resetPasswordToken= undefined;
        tuser.resetPasswordExpire= undefined;
        await tuser.save({validateBeforeSave: false});

        return  res.status(200).send(err.message);
    }
}
)



//reset password using forgot password
app.post('/resetpassword/:token',async(req,res,next)=>{
    const resetPasswordToken= crypto.createHash("sha256").update(req.params.token).digest("hex");

    const tuser = await users.findOne({
        resetPasswordToken,
        resetPasswordExpire:{ $gt:Date.now()},
    })

    if(!tuser){
        return res.status(200).send('password reset token is invalid or expired')
    }

    if(req.body.password !== req.body.confirmpassword){
        return res.status(200).send('password did not match')
    }

    tuser.password = req.body.password;
    tuser.confirmpassword = req.body.password;
    tuser.resetPasswordToken= undefined;
    tuser.resetPasswordExpire= undefined;

    await tuser.save();

    return  res.status(200).send("password changed successfully");

})



// // // register login -- -- --
app.post('/addregisterlogin',async(req,res)=>{
    try{
        const {username,password} = req.body;
        
        const newdata = new registerloginmodel({
            username,
            password
        })
        await newdata.save();
        return res.status(200).send('registerLogin Details saved successfully')
    }
    catch(err){
        console.log(err);
        return res.status(500).send('addregisterlogin Server Error ')
    }
})

// app.get('/getregisterlogin',middleware,async(req,res)=>{
//     try{
//         const exist = await registerloginmodel.find()
//         return res.status(200).json(exist);
//     }
//     catch(err){
//         console.log(err);
//         return res.status(500).send('getregisterlogin Server Error')
//     }
// })

// app.post('/verifyregisterlogin',async(req,res)=>{
//     try{
//         const {username,passwordv} = req.body;
//         const exist = await registerloginmodel.findOne({username});
//         if(!exist)
//         {
//             return res.status(200).send('failure')
//         }
//         if(exist.password !== passwordv)
//         {
//             return res.status(200).send('failure') 
//         }
//         if(exist.password === passwordv)
//         {
//             return res.status(200).send('success') 
//         }

        
//     }
//     catch(err){
//         console.log(err);
//         return res.status(500).send('addregisterlogin Server Error ')
//     }
// })



app.post('/verifyregisterlogin',async(req,res)=>{
    try{
        const {username,passwordv} = req.body;
        const exist = await registerloginmodel.findOne({username});
        if(!exist)
        {
            return res.status(200).send('failure')
        }
        if(exist.password !== passwordv)
        {
            return res.status(200).send('failure') 
        }
        let payload = {
            user : {
                id : exist.id
            }
        }
        jwt.sign(payload,'jwtPassword',{expiresIn:360000000},
        (err,token)=>{
            if(err) throw err
            return res.json({token:token,id:exist.branch})
        })
        
        
    }
    catch(err){
        console.log(err);
        return res.status(500).send('addregisterlogin Server Error ')
    }
})
/////////////












// // // Teachers -- -- --
app.post('/comment',middleware,async(req,res)=>{
    try{
        const {teacherName,
                teacherrefid,
                subjectKnowledge,
                communication,
                presentationSkills,
                punctuality,
                controlOverTheClass,
                audibility,
                professionalism,
                contentOfLecture,
                clarificationOfDoubts,
                explanationWithExamples,
                deptclass,
                comment,
            } = req.body;
        
            const existteacher = await teachersmodel.findById(teacherrefid);
            const existstudent = await users.findById(req.user.id);

            // const subject = existteacher.classes.map(item => item.year === existstudent.branch)
            
        
        const newfeedback = new feedbackmodel({
            teacherName,
            teacherrefid,
            teacherDepartment:existteacher.teacherDepartment,
            teachermob:existteacher.teachermob,
            teacheremail:existteacher.teacheremail,

            subjectKnowledge,
            communication,
            presentationSkills,
            punctuality,
            controlOverTheClass,
            audibility,
            professionalism,
            contentOfLecture,
            clarificationOfDoubts,
            explanationWithExamples,

            studentrefid:existstudent._id,
            studentclgId:existstudent.collegeId,
            studentName:existstudent.fullname,
            studentclass:deptclass,

            comment,

        })
        await newfeedback.save();
        const exist = await feedbackmodel.find()
        return res.status(200).json({message:'feedback submitted successfully',update:exist})
    }
    catch(err){
        console.log(err);
        return res.status(500).send('feedback Server Error')
    }
})








// // // Teachers -- -- --
app.post('/comment2',middleware,async(req,res)=>{
    try{
        const {
                subjectKnowledge,
                communication,
                presentationSkills,
                punctuality,
                controlOverTheClass,
                audibility,
                professionalism,
                contentOfLecture,
                clarificationOfDoubts,
                explanationWithExamples,
                deptclass,
                comment,

                oeSubjSec
            } = req.body;
        
            const existteacher = await teachersmodelOE.findOne({classes : oeSubjSec});
            const existstudent = await users.findById(req.user.id);

            // const subject = existteacher.classes.map(item => item.year === existstudent.branch)
            
        
        const newfeedback = new feedbackmodel({
            teacherName:existteacher.teacherName,
            teacherrefid:existteacher._id,
            teacherDepartment:existteacher.teacherDepartment,
            teachermob:existteacher.teachermob,
            teacheremail:existteacher.teacheremail,

            subjectKnowledge,
            communication,
            presentationSkills,
            punctuality,
            controlOverTheClass,
            audibility,
            professionalism,
            contentOfLecture,
            clarificationOfDoubts,
            explanationWithExamples,

            studentrefid:existstudent._id,
            studentclgId:existstudent.collegeId,
            studentName:existstudent.fullname,
            studentclass:deptclass,

            comment,

        })
        await newfeedback.save();


        await users.findByIdAndUpdate(req.user.id,{
            
            oe : "completed" || "-",
            
        })

        const exist = await feedbackmodel.find()
        return res.status(200).json({message:'OE feedback submitted successfully',update:exist})
    }
    catch(err){
        console.log(err);
        return res.status(500).send('feedback Server Error')
    }
})



app.get('/presentuser',middleware,async (req,res) =>{
    try{
        let exist = await users.findById(req.user.id);
        return res.json(exist);
    }
    catch(err){
        console.log(err);
        return res.status(500).send('present user Server Error')
    }
})







app.get('/checkrelation/:tid',middleware,async(req,res)=>{
    try{
        
        const exist = await feedbackmodel.find();
        const found = exist.filter(profile => profile.teacherrefid === req.params.tid && profile.studentrefid === req.user.id)
        
        if(found.length>=1){
            return res.send("relation")
        }
        return res.send("no relation")
    }
    catch(err){
        console.log(err);
        return res.status(500).send('checkrelation Server Error')
    }
})











//single
app.post('/deptsecfeedbacks' , async(req,res) =>{
    const {deptsec} = req.body
    try{
        const exist = await feedbackmodel.find( { studentclass: { $all: [ deptsec ] } } )
        console.log(exist)
        return res.send(exist)
    }
    catch(err){
        console.log(err);
        return res.status(500).send('checkrelation Server Error')
    }
})

app.post('/studentClgIdfeedbacks' , async(req,res) =>{
    const {studentClgId} = req.body
    try{
        const exist = await feedbackmodel.find( { studentclgId: { $all: [ studentClgId ] } } )
        console.log(exist)
        return res.send(exist)
    }
    catch(err){
        console.log(err);
        return res.status(500).send('checkrelation Server Error')
    }
})

app.post('/teacherfeedbacks' , async(req,res) =>{
    const {teacher} = req.body
    try{
        const exist = await feedbackmodel.find( { teacherName: { $all: [ teacher ] } } )
        console.log(exist)
        return res.send(exist)
    }
    catch(err){
        console.log(err);
        return res.status(500).send('checkrelation Server Error')
    }
})

//double
app.post('/teacherdeptsecfeedbacks' , async(req,res) =>{
    const {teacher,deptsec} = req.body
    try{
        const exist = await feedbackmodel.find( { $and: [ { teacherName: teacher }, { studentclass: deptsec } ] } )
        console.log(exist)
        return res.send(exist)
    }
    catch(err){
        console.log(err);
        return res.status(500).send('checkrelation Server Error')
    }
})

app.post('/teacherstudentClgIdfeedbacks' , async(req,res) =>{
    const {teacher,studentClgId} = req.body
    try{
        const exist = await feedbackmodel.find( { $and: [ { teacherName: teacher }, { studentclgId: studentClgId } ] } )
        console.log(exist)
        return res.send(exist)
    }
    catch(err){
        console.log(err);
        return res.status(500).send('checkrelation Server Error')
    }
})

app.post('/deptsecstudentClgIdfeedbacks' , async(req,res) =>{
    const {deptsec,studentClgId} = req.body
    try{
        const exist = await feedbackmodel.find( { $and: [ { studentclass: deptsec }, { studentclgId: studentClgId } ] } )
        console.log(exist)
        return res.send(exist)
    }
    catch(err){
        console.log(err);
        return res.status(500).send('checkrelation Server Error')
    }
})

//triple
app.post('/teacherdeptsecstudentClgIdfeedbacks' , async(req,res) =>{
    const {teacher,deptsec,studentClgId} = req.body
    try{
        const exist = await feedbackmodel.find( { $and: [ { teacherName: teacher },{ studentclass: deptsec }, { studentclgId: studentClgId } ] } )
        console.log(exist)
        return res.send(exist)
    }
    catch(err){
        console.log(err);
        return res.status(500).send('checkrelation Server Error')
    }
})




//team of support
app.post('/addsupportteam',async(req,res)=>{
    try{
        const {name,clgid,position,mobile,email} = req.body;
        
        const newsupportteam = new supportteammodel({
            name,
            clgid,
            position,
            mobile,
            email
        })
        await newsupportteam.save();
        let exist = await supportteammodel.find();
        return res.status(200).send({message:'team member saved successfully',update:exist})
    }
    catch(err){
        console.log(err);
        return res.status(500).send('addsupportteam Server Error ')
    }
})

app.get('/getsupportteam',async(req,res)=>{
    try{
        let exist = await supportteammodel.find();
        if(exist.length>=1){
            return res.status(200).json(exist);
        }
        else{
            return res.status(200).json(sample);
        }

    }
    catch(err){
        console.log(err);
        return res.status(500).send('getproject Server Error')
    }
})
//







app.post('/addOEteacher',async(req,res)=>{
    try{
        const {teacherName,
                teacherDepartment,
                classes,
                teacherqualification,
                teachermob,
                teacheremail} = req.body;
        
        const newOEteacher = new teachersmodelOE({
            teacherName,
            teacherDepartment,
            classes,
            teacherqualification,
            teachermob,
            teacheremail,
        })
        await newOEteacher.save();
        let exist = await teachersmodelOE.find();
        return res.status(200).send({message:'team OE teacher added successfully',update:exist})
    }
    catch(err){
        console.log(err);
        return res.status(500).send('add OE teacher Server Error ')
    }
})



app.listen(PORT,()=> console.log('Server is Running..'))